import { getStore, getDeployStore, type Store } from "@netlify/blobs";
import { randomUUID } from "crypto";
import type { Contribution, Database, Member } from "./schema";

/**
 * Netlify Blobs–backed store. Everything the rest of the app needs goes
 * through these functions, so swapping in Supabase/Postgres later is a
 * single-file job.
 *
 * Netlify's serverless/edge functions run on a read-only filesystem, so a
 * local JSON file (the previous implementation) throws on every write in
 * production. Blobs give us the same "one JSON blob = the whole db" model
 * without touching disk.
 */

const STORE_NAME = "rased-db";
const DB_KEY = "db.json";

const DEFAULT_MEMBERS = ["Nawal", "Abdullah", "Reem", "Abdulaziz", "Mukhtar", "Yara"];

function seedDatabase(): Database {
  const now = new Date().toISOString();
  return {
    members: DEFAULT_MEMBERS.map((name) => ({
      id: randomUUID(),
      name,
      createdAt: now,
      active: true,
    })),
    contributions: [],
  };
}

/**
 * Global store in production (persists across deploys), deploy-scoped store
 * everywhere else (previews/branches don't pollute production data).
 */
function getDbStore(): Store {
  const isProd = process.env.CONTEXT === "production";
  return isProd ? getStore({ name: STORE_NAME, consistency: "strong" }) : getDeployStore({ name: STORE_NAME, consistency: "strong" });
}

/** Serialise writes so two concurrent submissions can't clobber each other. */
let writeChain: Promise<unknown> = Promise.resolve();

/**
 * In-flight seed, shared by every caller that hits a missing blob at once.
 * Without this, two concurrent reads both try to create the database.
 */
let seeding: Promise<Database> | null = null;

async function readRaw(): Promise<Database> {
  const store = getDbStore();
  const parsed = await store.get(DB_KEY, { type: "json" });
  if (parsed) {
    return {
      members: parsed.members ?? [],
      contributions: parsed.contributions ?? [],
    };
  }
  if (!seeding) {
    seeding = (async () => {
      const seeded = seedDatabase();
      await writeRaw(seeded);
      return seeded;
    })();
    // Clear once settled, so deleting the blob later re-seeds properly.
    void seeding.finally(() => {
      seeding = null;
    });
  }
  return seeding;
}

async function writeRaw(db: Database): Promise<void> {
  const store = getDbStore();
  await store.setJSON(DB_KEY, db);
}

export async function readDb(): Promise<Database> {
  return readRaw();
}

/** Read-modify-write under a lock. The mutator may return a value to pass out. */
export async function mutate<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const db = await readRaw();
    const result = await fn(db);
    await writeRaw(db);
    return result;
  };
  const next = writeChain.then(run, run);
  // Keep the chain alive even if this operation rejects.
  writeChain = next.catch(() => undefined);
  return next;
}

// ----- members -------------------------------------------------------------

export async function listMembers(): Promise<Member[]> {
  const db = await readRaw();
  return db.members
    .filter((m) => m.active)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listAllMembers(): Promise<Member[]> {
  const db = await readRaw();
  return [...db.members].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getMember(id: string): Promise<Member | null> {
  const db = await readRaw();
  return db.members.find((m) => m.id === id) ?? null;
}

export async function addMember(name: string): Promise<Member> {
  return mutate((db) => {
    const clean = name.trim();
    const existing = db.members.find(
      (m) => m.name.toLowerCase() === clean.toLowerCase(),
    );
    if (existing) {
      existing.active = true;
      return existing;
    }
    const member: Member = {
      id: randomUUID(),
      name: clean,
      createdAt: new Date().toISOString(),
      active: true,
    };
    db.members.push(member);
    return member;
  });
}

export async function updateMember(
  id: string,
  patch: Partial<Pick<Member, "name" | "active">>,
): Promise<Member | null> {
  return mutate((db) => {
    const member = db.members.find((m) => m.id === id);
    if (!member) return null;
    if (patch.name != null) {
      member.name = patch.name.trim();
      for (const c of db.contributions) {
        if (c.memberId === id) c.memberName = member.name;
      }
    }
    if (patch.active != null) member.active = patch.active;
    return member;
  });
}

/** Soft-remove: keeps history intact but takes them off the picker. */
export async function removeMember(id: string): Promise<boolean> {
  return mutate((db) => {
    const member = db.members.find((m) => m.id === id);
    if (!member) return false;
    member.active = false;
    return true;
  });
}

// ----- contributions -------------------------------------------------------

export async function listContributions(): Promise<Contribution[]> {
  const db = await readRaw();
  return db.contributions
    .filter((c) => !c.removed)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listAllContributions(): Promise<Contribution[]> {
  const db = await readRaw();
  return [...db.contributions].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export async function getContribution(id: string): Promise<Contribution | null> {
  const db = await readRaw();
  return db.contributions.find((c) => c.id === id) ?? null;
}

export async function saveContribution(c: Contribution): Promise<Contribution> {
  return mutate((db) => {
    db.contributions.push(c);
    return c;
  });
}

export async function updateContribution(
  id: string,
  patch: Partial<Contribution>,
): Promise<Contribution | null> {
  return mutate((db) => {
    const idx = db.contributions.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    db.contributions[idx] = { ...db.contributions[idx], ...patch, id };
    return db.contributions[idx];
  });
}

export function newId(): string {
  return randomUUID();
}

/**
 * Saves a contribution, re-checking under the write lock whether an identical
 * source was stored in the meantime. `onCollision` decides what to do about it.
 */
export async function saveContributionGuarded(
  c: Contribution,
  isSameSource: (a: Contribution, b: Contribution) => boolean,
  onCollision: (c: Contribution, earlier: Contribution) => Contribution,
): Promise<Contribution> {
  return mutate((db) => {
    const earlier = db.contributions.find(
      (x) => !x.removed && x.id !== c.id && isSameSource(x, c),
    );
    const final = earlier ? onCollision(c, earlier) : c;
    db.contributions.push(final);
    return final;
  });
}
