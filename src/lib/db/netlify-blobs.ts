import { getStore, getDeployStore, type Store } from "@netlify/blobs";
import type { Database } from "./schema";
import type { StoreDriver, StoredDocument } from "./types";

/**
 * Netlify Blobs — the original backend, kept working so the app can still be
 * deployed to Netlify.
 *
 * Netlify's serverless/edge functions run on a read-only filesystem, so a
 * local JSON file (the implementation before this one) throws on every write
 * in production. Blobs give us the same "one JSON blob = the whole db" model
 * without touching disk.
 *
 * There is no cross-instance lock here. `transact` is a read followed by a
 * write, exactly as it always was: Blobs offer strong read-after-write
 * consistency but nothing that serialises two writers. `store.ts` still chains
 * calls inside one process, which is the only guard this backend ever had.
 */

const STORE_NAME = "rased-db";
const DB_KEY = "db.json";

/**
 * Global store in production (persists across deploys), deploy-scoped store
 * everywhere else (previews/branches don't pollute production data).
 */
function getDbStore(): Store {
  const isProd = process.env.CONTEXT === "production";
  return isProd
    ? getStore({ name: STORE_NAME, consistency: "strong" })
    : getDeployStore({ name: STORE_NAME, consistency: "strong" });
}

async function read(): Promise<StoredDocument | null> {
  return (await getDbStore().get(DB_KEY, { type: "json" })) ?? null;
}

async function write(db: Database): Promise<void> {
  await getDbStore().setJSON(DB_KEY, db);
}

async function transact<T>(
  apply: (raw: StoredDocument | null) => Promise<[Database, T]>,
): Promise<T> {
  const [db, result] = await apply(await read());
  await write(db);
  return result;
}

export const netlifyDriver: StoreDriver = {
  name: "netlify",
  read,
  transact,
};
