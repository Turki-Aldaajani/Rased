/**
 * Data model for Rased.
 * Deliberately flat and JSON-friendly so the store can be swapped for
 * Supabase/Postgres later without touching the services above it.
 */

export const CONTRIBUTION_TYPES = [
  "AI News",
  "AI Tool",
  "Research / Paper",
  "Project",
  "AI Use Case",
  "Learning Resource",
  "Other",
] as const;

export type ContributionType = (typeof CONTRIBUTION_TYPES)[number];

export type VerificationStatus = "verified" | "partial" | "unverified";
export type DuplicateStatus = "original" | "partial" | "duplicate";

export interface Member {
  id: string;
  name: string;
  createdAt: string; // ISO
  active: boolean;
}

/** Raw sub-scores produced by the evaluator (AI or heuristic). */
export interface ScoreBreakdown {
  importance: number; // 0..25
  recency: number; // 0..20
  usefulness: number; // 0..20
  relevance: number; // 0..15
  sourceReliability: number; // 0..10
  personalContribution: number; // 0..10
}

export interface Evaluation {
  verified: VerificationStatus;
  /** Original publication / release date of the thing itself, not the submit date. */
  originalDate: string | null;
  /** Canonical/official source the evaluator settled on. */
  resolvedSource: string | null;
  duplicate: DuplicateStatus;
  duplicateOfId: string | null;
  duplicateReason: string | null;
  breakdown: ScoreBreakdown;
  /** Score before the duplicate multiplier. */
  rawScore: number;
  /** Final, saved score (0..100). */
  finalScore: number;
  reason: string;
  /** Short bullet notes gathered while verifying on the web. */
  evidence: string[];
  /** "ai" when Claude evaluated it, "heuristic" for the offline fallback. */
  engine: "ai" | "heuristic";
  model: string | null;
}

export interface Contribution {
  id: string;
  memberId: string;
  memberName: string; // denormalised for simple reads
  title: string;
  url: string;
  description: string;
  whyUseful: string;
  type: ContributionType;
  createdAt: string; // ISO — when it was submitted
  weekKey: string; // e.g. 2026-W37
  monthKey: string; // e.g. 2026-09
  evaluation: Evaluation;
  /** Set when an admin overrides the automatic result. */
  adminOverride: {
    score: number | null;
    duplicate: DuplicateStatus | null;
    note: string;
    at: string;
  } | null;
  removed: boolean;
}

export interface Database {
  members: Member[];
  contributions: Contribution[];
}

/** Score actually used for rankings — admin override wins over the AI. */
export function effectiveScore(c: Contribution): number {
  if (c.adminOverride?.score != null) return c.adminOverride.score;
  return c.evaluation.finalScore;
}

export function effectiveDuplicate(c: Contribution): DuplicateStatus {
  return c.adminOverride?.duplicate ?? c.evaluation.duplicate;
}
