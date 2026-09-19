import { getStore, getDeployStore, type Store } from "@netlify/blobs";
import { randomUUID } from "crypto";
import { POINTS } from "@/lib/config/rules";
import {
  NEWSLETTER_CATEGORIES,
  type Contribution,
  type ContributionStatus,
  type Database,
  type Evaluation,
  type Member,
  type NewsletterCategory,
  type PointsAward,
} from "./schema";
import { cycleKey, monthKey, weekKey } from "@/lib/util/date";
import type { NewsletterIssue } from "@/lib/newsletter/types";

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

/**
 * Seed roster. The team is nine people; the names here are the ones the app
 * shipped with, and the rest are added from /admin (or via RASED_TEAM, a
 * comma-separated list, so a fresh deploy starts with the real roster).
 */
const DEFAULT_MEMBERS = ["Nawal", "Abdullah", "Reem", "Abdulaziz", "Mukhtar", "Yara"];

function seedNames(): string[] {
  const configured = (process.env.RASED_TEAM || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_MEMBERS;
}

function seedDatabase(): Database {
  const now = new Date().toISOString();
  return {
    members: seedNames().map((name) => ({
      id: randomUUID(),
      name,
      createdAt: now,
      active: true,
      focusArea: null,
    })),
    contributions: [],
    newsletters: [],
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

// ---------------------------------------------------------------------------
// Migration — records written before the contribution engine existed
// ---------------------------------------------------------------------------

interface LegacyEvaluation {
  finalScore?: number;
  duplicate?: string;
  duplicateOfId?: string | null;
  duplicateReason?: string | null;
  reason?: string;
  evidence?: string[];
  verified?: string;
  originalDate?: string | null;
  resolvedSource?: string | null;
  engine?: "ai" | "heuristic";
  model?: string | null;
}

/**
 * Old rows stored a single 0-100 score as the member's points. That number is
 * an editorial judgement, not a point, so it is carried over as the editorial
 * score and the member's points are recomputed under the new flat rule.
 */
function migrateContribution(raw: Record<string, unknown>): Contribution {
  if (raw.points && raw.status) return raw as unknown as Contribution;

  const legacy = (raw.evaluation ?? {}) as LegacyEvaluation;
  const createdAt = String(raw.createdAt ?? new Date().toISOString());
  const dup =
    legacy.duplicate === "duplicate"
      ? "duplicate"
      : legacy.duplicate === "partial"
        ? "same_topic_new_value"
        : "unique";
  const status: ContributionStatus =
    dup === "duplicate"
      ? "duplicate"
      : dup === "same_topic_new_value"
        ? "accepted_with_new_angle"
        : "accepted";

  const evaluation: Evaluation | null = raw.evaluation
    ? {
        status: status as Exclude<ContributionStatus, "pending">,
        rejectionReason: null,
        eligibility: {
          aiRelated: true,
          specificInformation: true,
          usableSource: true,
          understandableFromSource: true,
          memberExplainedWhy: Boolean(String(raw.whyUseful ?? "").trim()),
          usefulKnowledge: true,
        },
        classification: {
          primary: "important_news",
          secondary: [],
          reason: "مُرحَّلة من النسخة السابقة قبل وجود التصنيف التلقائي.",
        },
        audience: { tags: ["general_users"], reason: "" },
        difficulty: { level: "not_applicable", prerequisites: [] },
        duplicate: {
          outcome: dup,
          ofId: legacy.duplicateOfId ?? null,
          confidence: dup === "unique" ? 0 : 0.8,
          reason: legacy.duplicateReason ?? "",
          matches: [],
        },
        verification: {
          status:
            legacy.verified === "verified"
              ? "verified"
              : legacy.verified === "partial"
                ? "partially_verified"
                : "not_independently_verified",
          evidence: legacy.evidence ?? [],
          resolvedSource: legacy.resolvedSource ?? null,
          originalDate: legacy.originalDate ?? null,
        },
        extracted: {
          title: String(raw.title ?? "") || null,
          source: null,
          sourceUrl: String(raw.url ?? "") || null,
          publicationDate: legacy.originalDate ?? null,
          entity: null,
          keyPoints: [],
          capabilities: [],
          practicalValue: null,
          links: [],
        },
        aiInterpretation: "",
        aiSummary: String(raw.description ?? ""),
        editorial: {
          score: Number(legacy.finalScore ?? 0),
          rawScore: Number(legacy.finalScore ?? 0),
          breakdown: {
            aiRelevance: 0,
            significance: 0,
            usefulness: 0,
            recency: 0,
            sourceCredibility: 0,
            audienceFit: 0,
            uniqueness: 0,
            newsletterValue: 0,
          },
          notes: ["قيمة تحريرية مُرحَّلة من نظام التقييم السابق (0-100)."],
        },
        summaryForMember: legacy.reason ?? "",
        engine: legacy.engine ?? "heuristic",
        model: legacy.model ?? null,
        evaluatedAt: createdAt,
      }
    : null;

  const points: PointsAward = {
    // Recomputed on read is not possible without the whole cycle, so the flat
    // rule is applied here and the cap is enforced by the migration pass below.
    awarded: status === "duplicate" ? 0 : POINTS.perValidContribution,
    reason: status === "duplicate" ? "duplicate" : "valid_contribution",
    cycleKey: cycleKey(createdAt),
    cycleTotalBefore: 0,
  };

  return {
    id: String(raw.id ?? randomUUID()),
    memberId: String(raw.memberId ?? ""),
    memberName: String(raw.memberName ?? ""),
    title: String(raw.title ?? ""),
    url: String(raw.url ?? ""),
    description: String(raw.description ?? ""),
    memberReason: String(raw.whyUseful ?? ""),
    note: "",
    focusArea: null,
    createdAt,
    cycleKey: cycleKey(createdAt),
    weekKey: String(raw.weekKey ?? weekKey(createdAt)),
    monthKey: String(raw.monthKey ?? monthKey(createdAt)),
    status,
    evaluation,
    points,
    evaluationError: null,
    evaluationAttempts: 1,
    adminOverride: null,
    removed: Boolean(raw.removed),
  };
}

/** Re-applies the per-cycle cap across migrated rows, oldest first. */
function enforceCapAcrossHistory(contributions: Contribution[]): void {
  const totals = new Map<string, number>();
  const chronological = [...contributions].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  for (const c of chronological) {
    if (c.removed || c.points.awarded === 0) continue;
    const key = `${c.memberId}:${c.cycleKey}`;
    const before = totals.get(key) ?? 0;
    c.points.cycleTotalBefore = before;
    if (before >= POINTS.maxPerCycle) {
      c.points.awarded = 0;
      c.points.reason = "cycle_cap_reached";
    } else {
      totals.set(key, before + c.points.awarded);
    }
  }
}

function migrateMember(raw: Record<string, unknown>): Member {
  const focus = String(raw.focusArea ?? "");
  return {
    id: String(raw.id ?? randomUUID()),
    name: String(raw.name ?? ""),
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    active: raw.active !== false,
    focusArea:
      (NEWSLETTER_CATEGORIES.find((c) => c === focus) as NewsletterCategory) ??
      null,
  };
}

async function readRaw(): Promise<Database> {
  const store = getDbStore();
  const parsed = await store.get(DB_KEY, { type: "json" });
  if (parsed) {
    const members = (parsed.members ?? []).map(migrateMember);
    const contributions = (parsed.contributions ?? []).map(migrateContribution);
    const needsMigration = (parsed.contributions ?? []).some(
      (c: Record<string, unknown>) => !c.points || !c.status,
    );
    if (needsMigration) enforceCapAcrossHistory(contributions);
    return {
      members,
      contributions,
      newsletters: (parsed.newsletters ?? []) as NewsletterIssue[],
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
      focusArea: null,
    };
    db.members.push(member);
    return member;
  });
}

export async function updateMember(
  id: string,
  patch: Partial<Pick<Member, "name" | "active" | "focusArea">>,
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
    if (patch.focusArea !== undefined) member.focusArea = patch.focusArea;
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

// ----- the one write that has to be atomic ---------------------------------

export interface AwardContext {
  /** Points the member already holds in this cycle, read under the lock. */
  cycleTotalBefore: number;
  /** An earlier contribution with the same source, if one slipped in. */
  collision: Contribution | null;
}

/**
 * Saves an evaluated contribution and decides its points in the same locked
 * read-modify-write.
 *
 * Both halves have to happen together: the per-cycle cap and the duplicate
 * check are both reads of the live database, and two submissions evaluated
 * concurrently would otherwise both see stale state and both be counted.
 */
export async function saveWithAward(
  contribution: Contribution,
  isSameSource: (a: Contribution, b: Contribution) => boolean,
  decide: (c: Contribution, ctx: AwardContext) => Contribution,
): Promise<Contribution> {
  return mutate((db) => {
    const collision =
      db.contributions.find(
        (x) =>
          !x.removed &&
          x.id !== contribution.id &&
          isSameSource(x, contribution),
      ) ?? null;

    const cycleTotalBefore = db.contributions
      .filter(
        (c) =>
          !c.removed &&
          c.memberId === contribution.memberId &&
          c.cycleKey === contribution.cycleKey,
      )
      .reduce(
        (sum, c) => sum + (c.adminOverride?.points ?? c.points.awarded),
        0,
      );

    const final = decide(contribution, { cycleTotalBefore, collision });
    db.contributions.push(final);
    return final;
  });
}

/** Same deal for a retry: the row already exists, so it is replaced in place. */
export async function replaceWithAward(
  id: string,
  decide: (current: Contribution, ctx: AwardContext) => Contribution,
): Promise<Contribution | null> {
  return mutate((db) => {
    const idx = db.contributions.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    const current = db.contributions[idx];

    const collision =
      db.contributions.find(
        (x) => !x.removed && x.id !== id && x.url === current.url,
      ) ?? null;

    const cycleTotalBefore = db.contributions
      .filter(
        (c) =>
          !c.removed &&
          c.id !== id &&
          c.memberId === current.memberId &&
          c.cycleKey === current.cycleKey,
      )
      .reduce(
        (sum, c) => sum + (c.adminOverride?.points ?? c.points.awarded),
        0,
      );

    const updated = decide(current, { cycleTotalBefore, collision });
    db.contributions[idx] = updated;
    return updated;
  });
}

// ----- newsletter issues ---------------------------------------------------

export async function listIssues(): Promise<NewsletterIssue[]> {
  const db = await readRaw();
  return [...db.newsletters].sort((a, b) => b.number - a.number);
}

export async function getIssue(id: string): Promise<NewsletterIssue | null> {
  const db = await readRaw();
  return db.newsletters.find((n) => n.id === id) ?? null;
}

/**
 * Replaces one issue under the write lock. `fn` receives the stored issue and
 * the whole database (read-only for anything else) and returns the new issue,
 * or throws to leave everything untouched.
 */
export async function updateIssue(
  id: string,
  fn: (current: NewsletterIssue, db: Database) => NewsletterIssue | Promise<NewsletterIssue>,
): Promise<NewsletterIssue | null> {
  return mutate(async (db) => {
    const idx = db.newsletters.findIndex((n) => n.id === id);
    if (idx === -1) return null;
    const next = await fn(db.newsletters[idx], db);
    db.newsletters[idx] = { ...next, id, updatedAt: new Date().toISOString() };
    return db.newsletters[idx];
  });
}

/** Adds an issue; `fn` may refuse (throw) after looking at the others. */
export async function insertIssue(
  fn: (db: Database) => NewsletterIssue,
): Promise<NewsletterIssue> {
  return mutate((db) => {
    const issue = fn(db);
    db.newsletters.push(issue);
    return issue;
  });
}

export async function deleteIssue(
  id: string,
  guard: (issue: NewsletterIssue) => void,
): Promise<boolean> {
  return mutate((db) => {
    const issue = db.newsletters.find((n) => n.id === id);
    if (!issue) return false;
    guard(issue);
    db.newsletters = db.newsletters.filter((n) => n.id !== id);
    return true;
  });
}
