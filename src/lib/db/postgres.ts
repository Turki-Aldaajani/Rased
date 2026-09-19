import { Pool, type PoolConfig } from "pg";
import type { Database } from "./schema";
import type { StoreDriver, StoredDocument } from "./types";

/**
 * Postgres — the whole database as one `jsonb` document in one row.
 *
 * The shape is deliberately the same as the blob backends: every read in the
 * app loads the entire database anyway (leaderboards, cycle totals and the
 * duplicate check are all computed in memory over the full set), so splitting
 * it into tables would buy nothing today and would mean rewriting every caller
 * of `mutate`.
 *
 * What Postgres buys that a blob cannot: a real lock. `transact` runs inside a
 * transaction holding an advisory lock, so two submissions landing on two
 * serverless instances at the same moment are serialised for real. On the blob
 * backends the second one silently overwrites the first.
 *
 * When contributions eventually outgrow a single document, the move to proper
 * tables happens inside this same database — no second migration between
 * providers.
 */

const TABLE = "rased_store";
const ROW_ID = "db";

/**
 * Advisory-lock key: a fixed pair of int4s ("RASD", document 1) so it cannot
 * collide with another application sharing the database.
 *
 * Transaction-scoped on purpose — it is released by COMMIT or ROLLBACK, which
 * is what PgBouncer's transaction pooling (Neon's `-pooler` endpoint, Supabase
 * port 6543) requires. A session-scoped lock would leak across pooled clients
 * and eventually deadlock the app.
 */
const LOCK_KEYS: [number, number] = [0x52415344, 0x00000001];

const UPSERT = `INSERT INTO ${TABLE} (id, doc, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`;

function connectionString(): string {
  const url = (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    ""
  ).trim();
  if (!url) {
    throw new Error(
      "STORAGE_PROVIDER=postgres يحتاج DATABASE_URL (أو POSTGRES_URL). " +
        "استخدم رابط الاتصال المجمّع (pooled/pgbouncer) من Neon أو Supabase، " +
        "لا الرابط المباشر — الدوال بلا خادم تفتح اتصالًا لكل استدعاء.",
    );
  }
  return url;
}

/**
 * Hosted Postgres (Neon, Supabase, Vercel) requires TLS and presents a
 * publicly-trusted certificate, so ordinary verification works. An `sslmode`
 * already in the URL is left to `pg` to parse; POSTGRES_SSL overrides both,
 * and a local database defaults to no TLS.
 */
function sslFor(url: string): PoolConfig["ssl"] | undefined {
  const explicit = (process.env.POSTGRES_SSL || "").trim();
  if (explicit === "disable") return false;
  if (explicit === "no-verify") return { rejectUnauthorized: false };
  if (explicit === "require") return true;
  if (/[?&]sslmode=/i.test(url)) return undefined;
  return /@(localhost|127\.0\.0\.1|\[::1\])[:/]/i.test(url) ? false : true;
}

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const url = connectionString();
    const ssl = sslFor(url);
    pool = new Pool({
      connectionString: url,
      // One connection per instance: the provider's pooler does the real
      // pooling, and a serverless instance never needs more than the single
      // request it is serving.
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      ...(ssl !== undefined ? { ssl } : {}),
    });
    // A pooler dropping an idle connection must not take the process down.
    pool.on("error", () => {});
  }
  return pool;
}

let ready: Promise<void> | null = null;

/** Creates the document table. Runs once per process, retried if it fails. */
function ensureSchema(): Promise<void> {
  if (!ready) {
    const attempt = getPool()
      .query(
        `CREATE TABLE IF NOT EXISTS ${TABLE} (
           id         text PRIMARY KEY,
           doc        jsonb NOT NULL,
           updated_at timestamptz NOT NULL DEFAULT now()
         )`,
      )
      .then(() => undefined);
    ready = attempt;
    // Never cache a failed bootstrap — the next caller tries again.
    void attempt.catch(() => {
      if (ready === attempt) ready = null;
    });
  }
  return ready;
}

async function read(): Promise<StoredDocument | null> {
  await ensureSchema();
  const { rows } = await getPool().query<{ doc: StoredDocument }>(
    `SELECT doc FROM ${TABLE} WHERE id = $1`,
    [ROW_ID],
  );
  return rows[0]?.doc ?? null;
}

async function transact<T>(
  apply: (raw: StoredDocument | null) => Promise<[Database, T]>,
): Promise<T> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // The advisory lock, not SELECT ... FOR UPDATE: on the very first write
    // the row does not exist yet, and FOR UPDATE on no rows locks nothing —
    // which is exactly when two instances would both try to seed.
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", LOCK_KEYS);
    const { rows } = await client.query<{ doc: StoredDocument }>(
      `SELECT doc FROM ${TABLE} WHERE id = $1`,
      [ROW_ID],
    );
    const [db, result] = await apply(rows[0]?.doc ?? null);
    await client.query(UPSERT, [ROW_ID, JSON.stringify(db)]);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export const postgresDriver: StoreDriver = {
  name: "postgres",
  read,
  transact,
};
