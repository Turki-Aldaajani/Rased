#!/usr/bin/env node
/**
 * Moves the Rased database from one storage backend to another.
 *
 * The database is a single JSON document, so this is a copy, not a schema
 * conversion: whatever shape the source holds is written to the destination
 * byte-for-byte. Migration of old rows (pre-contribution-engine records) is
 * `store.ts`'s job and happens on the first read, exactly as it does today.
 *
 * Usage
 *   node scripts/migrate-store.mjs --from netlify --to postgres
 *   node scripts/migrate-store.mjs --from ./backup.json --to postgres
 *   node scripts/migrate-store.mjs --from netlify --to ./backup.json
 *
 * Flags
 *   --from <netlify|postgres|PATH>  where to read
 *   --to   <netlify|postgres|PATH>  where to write
 *   --force                         overwrite a non-empty destination
 *   --dry-run                       read and report, write nothing
 *
 * Environment
 *   netlify   NETLIFY_AUTH_TOKEN + NETLIFY_SITE_ID   (production blobs)
 *   postgres  DATABASE_URL (or POSTGRES_URL)
 *
 * Both are read from .env.local / .env when present.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const STORE_NAME = "rased-db";
const DB_KEY = "db.json";
const TABLE = "rased_store";
const ROW_ID = "db";

// ---------------------------------------------------------------------------
// Arguments and environment
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { from: "", to: "", force: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from") args.from = argv[++i] ?? "";
    else if (a === "--to") args.to = argv[++i] ?? "";
    else if (a === "--force") args.force = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else die(`وسيط غير معروف: ${a}`);
  }
  return args;
}

/** Loads .env.local then .env, without overwriting what is already set. */
function loadEnvFiles() {
  for (const name of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      const key = m[1];
      if (process.env[key] !== undefined) continue;
      let value = m[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

function die(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function required(name, why) {
  const value = (process.env[name] || "").trim();
  if (!value) die(`${name} مفقود — ${why}`);
  return value;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/**
 * Netlify Blobs through the same client the app itself uses (@netlify/blobs),
 * given an explicit site id and token so it runs from a plain terminal without
 * a linked site or `netlify dev`.
 *
 * The first version of this script spoke the REST API by hand and got two
 * things wrong: it left out the `accept: application/json;type=signed-url`
 * header the API requires, and it addressed the store as `rased-db` when a
 * site store is really `site:rased-db`. The second one produced a 404, which
 * read as "the source is empty" - the worst possible way to be wrong when the
 * point is not to lose data. Going through the client removes that whole class
 * of mistake, because it is exactly what production reads with.
 *
 * This reads the GLOBAL store (`getStore`), which is what production uses.
 * Deploy-scoped blobs (previews and local `netlify dev`) are a different
 * namespace and are not what you want to migrate.
 */
async function netlifyEndpoint() {
  const token = required(
    "NETLIFY_AUTH_TOKEN",
    "أنشئه من Netlify → User settings → Applications → Personal access tokens",
  );
  const siteID = required(
    "NETLIFY_SITE_ID",
    "معرّف الموقع من Netlify → Site configuration → Site information → Site ID",
  );

  const { getStore, listStores } = await import("@netlify/blobs");
  const store = getStore({ name: STORE_NAME, siteID, token, consistency: "strong" });

  return {
    label: `Netlify Blobs (${STORE_NAME}/${DB_KEY} @ ${siteID})`,

    async read() {
      let doc;
      try {
        doc = await store.get(DB_KEY, { type: "json" });
      } catch (err) {
        // 401/403 here almost always means a wrong token or site id, and a raw
        // stack trace does not say so.
        die(
          `Netlify رفض القراءة (${err?.message ?? err}). تحقق من NETLIFY_AUTH_TOKEN ومن أن NETLIFY_SITE_ID لموقع الإنتاج.`,
        );
      }
      if (doc) return doc;

      // A miss is ambiguous (wrong site, wrong store name, or genuinely empty),
      // so say which stores this site does have before anyone concludes "empty".
      try {
        const { stores } = await listStores({ siteID, token });
        console.log(
          stores.length > 0
            ? `\n  لا يوجد "${STORE_NAME}/${DB_KEY}" لكن الموقع فيه مخازن: ${stores.join(", ")}`
            : "\n  الموقع لا يحتوي أي مخزن عالمي — تأكد أن NETLIFY_SITE_ID لموقع الإنتاج.",
        );
      } catch (err) {
        console.log(`\n  تعذّر سرد المخازن: ${err?.message ?? err}`);
      }
      return null;
    },

    async write(doc) {
      await store.setJSON(DB_KEY, doc);
    },
  };
}

async function postgresEndpoint() {
  const url = (process.env.DATABASE_URL || process.env.POSTGRES_URL || "").trim();
  if (!url) die("DATABASE_URL (أو POSTGRES_URL) مفقود — رابط الاتصال بقاعدة Postgres.");

  const { default: pg } = await import("pg");
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/i.test(url);
  const client = new pg.Client({
    connectionString: url,
    ...(/[?&]sslmode=/i.test(url) ? {} : { ssl: local ? false : true }),
  });
  await client.connect();
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
       id         text PRIMARY KEY,
       doc        jsonb NOT NULL,
       updated_at timestamptz NOT NULL DEFAULT now()
     )`,
  );

  return {
    label: `Postgres (${TABLE}.${ROW_ID} @ ${url.replace(/:[^:@/]*@/, ":***@")})`,

    async read() {
      const { rows } = await client.query(
        `SELECT doc FROM ${TABLE} WHERE id = $1`,
        [ROW_ID],
      );
      return rows[0]?.doc ?? null;
    },

    async write(doc) {
      await client.query(
        `INSERT INTO ${TABLE} (id, doc, updated_at) VALUES ($1, $2::jsonb, now())
           ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
        [ROW_ID, JSON.stringify(doc)],
      );
    },

    async close() {
      await client.end();
    },
  };
}

function fileEndpoint(path) {
  const full = resolve(process.cwd(), path);
  return {
    label: `ملف (${full})`,
    // Missing reads as empty rather than fatal: the same endpoint is used to
    // check whether a destination is already occupied, and a file that is not
    // there yet is exactly the empty destination we are hoping for.
    async read() {
      if (!existsSync(full)) return null;
      return JSON.parse(readFileSync(full, "utf8"));
    },
    async write(doc) {
      writeFileSync(full, JSON.stringify(doc, null, 2) + "\n", "utf8");
    },
  };
}

function endpoint(spec) {
  if (spec === "netlify") return netlifyEndpoint();
  if (spec === "postgres") return postgresEndpoint();
  if (spec.includes("/") || spec.includes("\\") || spec.endsWith(".json")) {
    return fileEndpoint(spec);
  }
  die(`وجهة غير معروفة: "${spec}". استخدم netlify أو postgres أو مسار ملف .json.`);
}

// ---------------------------------------------------------------------------

/**
 * A key-order-independent rendering of a value.
 *
 * Postgres `jsonb` stores objects normalised — keys are reordered and
 * duplicates dropped — so a document that survived a round trip through it is
 * semantically identical but not textually identical. Nothing in the app reads
 * JSON by position, so canonicalising both sides is the honest comparison.
 */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  }
  return value;
}

function describe(doc) {
  if (!doc) return "فارغ";
  const n = (k) => (Array.isArray(doc[k]) ? doc[k].length : 0);
  const bytes = Buffer.byteLength(JSON.stringify(doc));
  return `${n("members")} عضو · ${n("contributions")} مساهمة · ${n("newsletters")} عدد نشرة · ${bytes.toLocaleString("en-US")} بايت`;
}

async function main() {
  loadEnvFiles();
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.from || !args.to) {
    console.log(readFileSync(new URL(import.meta.url)).toString().split("*/")[0].replace(/^#!.*\n/, ""));
    process.exit(args.help ? 0 : 1);
  }
  if (args.from === args.to) die("--from و --to متطابقان.");

  const source = await endpoint(args.from);
  const target = await endpoint(args.to);

  try {
    console.log(`\n  من : ${source.label}`);
    console.log(`  إلى: ${target.label}\n`);

    const doc = await source.read();
    if (!doc) die("المصدر فارغ أو غير موجود — ما فيه شيء يُنقل.");
    console.log(`  المصدر : ${describe(doc)}`);

    const existing = await target.read();
    console.log(`  الوجهة : ${describe(existing)}`);

    const occupied =
      existing &&
      ((existing.contributions?.length ?? 0) > 0 ||
        (existing.newsletters?.length ?? 0) > 0);
    if (occupied && !args.force) {
      die(
        "الوجهة فيها بيانات بالفعل. راجعها أولًا، ثم أعد التشغيل بـ--force إذا كنت تقصد الكتابة فوقها.",
      );
    }

    if (args.dryRun) {
      console.log("\n  --dry-run: لم تُكتب أي بيانات.\n");
      return;
    }

    await target.write(doc);
    const after = await target.read();
    const ok =
      JSON.stringify(canonical(after)) === JSON.stringify(canonical(doc));

    console.log(`\n  ${ok ? "✓ تمّت" : "✖ تعذّر التحقق"} — الوجهة الآن: ${describe(after)}\n`);
    if (!ok) process.exitCode = 1;
  } finally {
    await source.close?.();
    await target.close?.();
  }
}

main().catch((err) => die(err?.stack || String(err)));
