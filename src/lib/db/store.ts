import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Contribution, Database, Member } from "./schema";

/**
 * Tiny JSON-file store. Everything the rest of the app needs goes through
 * these functions, so swapping in Supabase/Postgres later is a single-file job.
 */

const DB_PATH = path.join(process.cwd(), "data", "db.json");

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

/** Serialise writes so two concurrent submissions can't clobber each other. */
let writeChain: Promise<unknown> = Promise.resolve();

/**
 * In-flight seed, shared by every caller that hits a missing file at once.
 * Without this, two concurrent reads both try to create the database.
 */
let seeding: Promise<Database> | null = null;

async function readRaw(): Promise<Database> {
  try {
    const text = await fs.readFile(DB_PATH, "utf8");
    const parsed = JSON.parse(text) as Database;
    return {
      members: parsed.members ?? [],
      contributions: parsed.contributions ?? [],
    };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
    if (!seeding) {
      seeding = (async () => {
        const seeded = seedDatabase();
        await writeRaw(seeded);
        return seeded;
      })();
      // Clear once settled, so deleting the file later re-seeds properly.
      void seeding.finally(() => {
        seeding = null;
      });
    }
    return seeding;
  }
}

let tmpCounter = 0;

async function writeRaw(db: Database): Promise<void> {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  // Unique per write — two writers sharing a temp path race on rename.
  const tmp = `${DB_PATH}.${process.pid}.${++tmpCounter}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, DB_PATH);
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
