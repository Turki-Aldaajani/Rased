import type { Database } from "./schema";

/**
 * Which backend `store.ts` talks to. Chosen by STORAGE_PROVIDER, the same way
 * AI_PROVIDER chooses between Claude and DeepSeek.
 */
export type StorageProvider = "netlify" | "postgres";

/**
 * A stored document, exactly as it came back from the backend, rows written
 * before the contribution engine existed included. Hydrating it into a
 * `Database` is `store.ts`'s job, so every backend goes through one migration
 * path instead of each driver growing its own.
 */
export interface StoredDocument {
  members?: Record<string, unknown>[];
  contributions?: Record<string, unknown>[];
  newsletters?: unknown[];
  cycleEndOverrides?: unknown;
}

/**
 * What a storage backend has to provide. The whole application is built on one
 * JSON document, so a driver only ever has to move that document around,
 * seeding, migration, points and leaderboards all sit above this line.
 */
export interface StoreDriver {
  readonly name: StorageProvider;

  /** The stored document, or null when nothing has been written yet. */
  read(): Promise<StoredDocument | null>;

  /**
   * Read-modify-write under whatever exclusion the backend can offer.
   *
   * `apply` receives the raw stored document (null when there is none) and
   * returns the document to store plus a value handed back to the caller.
   *
   * This is the one operation that decides whether two concurrent submissions
   * can clobber each other: `saveWithAward` reads the duplicate check and the
   * per-cycle cap and writes its verdict inside a single call. A driver with a
   * real lock (postgres) holds it for the whole call; one without (netlify)
   * degrades to a plain read-then-write, which is all it ever did.
   */
  transact<T>(
    apply: (raw: StoredDocument | null) => Promise<[Database, T]>,
  ): Promise<T>;
}
