/**
 * Data model for Rased.
 * Deliberately flat and JSON-friendly so the store can be swapped for
 * Supabase/Postgres later without touching the services above it.
 *
 * The model keeps two things apart on purpose:
 *   points    , what the MEMBER earned. Flat, capped, category-blind.
 *   editorial , what the CONTENT is worth to the newsletter. Never points.
 */

import type { EditorialDimension } from "@/lib/config/rules";
import type { NewsletterIssue } from "@/lib/newsletter/types";

// ---------------------------------------------------------------------------
// Vocabularies
// ---------------------------------------------------------------------------

/** The six sections of the newsletter. */
export const NEWSLETTER_CATEGORIES = [
  "important_news",
  "new_models",
  "new_tools",
  "other_tools",
  "learn_this_week",
  "social_trends",
] as const;

export type NewsletterCategory = (typeof NEWSLETTER_CATEGORIES)[number];

export const AUDIENCES = [
  "beginners",
  "university_students",
  "developers",
  "ai_engineers",
  "data_scientists",
  "researchers",
  "designers",
  "entrepreneurs",
  "content_creators",
  "general_users",
] as const;

export type Audience = (typeof AUDIENCES)[number];

export const DIFFICULTIES = [
  "beginner",
  "intermediate",
  "advanced",
  "not_applicable",
] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];

/**
 * What happened to a submission.
 * "pending" means the evaluator could not be reached, the submission is kept
 * and can be retried, and it earns nothing until the evaluation succeeds.
 * "blocked_source" means the source refused our automated read (HTTP 403 and
 * its kin). Retrying would fail the same way, so it waits for a host to decide
 * by hand instead, and earns nothing until they do.
 */
export const CONTRIBUTION_STATUSES = [
  "accepted",
  "accepted_with_new_angle",
  "duplicate",
  "rejected",
  "pending",
  "blocked_source",
] as const;

export type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

/** The statuses an evaluation can end in, the two above have no evaluation. */
export type EvaluatedStatus = Exclude<
  ContributionStatus,
  "pending" | "blocked_source"
>;

/** The three duplicate outcomes. "same_topic_new_value" still earns a point. */
export const DUPLICATE_OUTCOMES = [
  "unique",
  "same_topic_new_value",
  "duplicate",
] as const;

export type DuplicateOutcome = (typeof DUPLICATE_OUTCOMES)[number];

/**
 * How far the claim could actually be checked. We never claim more than we
 * did: with no web access the honest answer is the third one.
 */
export const VERIFICATION_STATUSES = [
  "verified",
  "partially_verified",
  "not_independently_verified",
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/**
 * What a section asks a member to write, on top of the link itself. Each one
 * belongs to a section (see BONUS.bySection) and is worth what that section
 * says it is worth.
 */
export const BONUS_REQUIREMENTS = [
  "why_it_matters",
  "who_is_it_for",
  "how_to_use",
  "quick_example",
  "takeaway",
] as const;

export type BonusRequirement = (typeof BONUS_REQUIREMENTS)[number];

/**
 * Where a bonus stands. "none" covers both "nothing was proposed" and "the
 * contribution cannot carry one"; everything else is a decision waiting for,
 * or already taken by, a host.
 */
export const BONUS_STATUSES = [
  "none",
  "pending",
  "confirmed",
  "rejected",
] as const;

export type BonusStatus = (typeof BONUS_STATUSES)[number];

/** Why the evaluator did not put a bonus forward. */
export const BONUS_SKIP_REASONS = [
  "no_valid_news",
  "text_does_not_qualify",
  "already_earned_this_cycle",
  "no_category",
] as const;

export type BonusSkipReason = (typeof BONUS_SKIP_REASONS)[number];

/**
 * The bonus record on a contribution.
 *
 * The evaluator only ever fills `suggested`. Nothing reaches the board until a
 * host sets `status` to "confirmed", which is the whole point: the machine
 * cannot tell real usage steps from a paragraph copied off the tool's own
 * page, so it proposes and a person decides.
 */
export interface BonusAward {
  /** What the evaluator put forward, or null when it put nothing forward. */
  suggested: {
    requirement: BonusRequirement;
    value: number;
    /** One line in Arabic on what in the member's text earned it. */
    reason: string;
  } | null;
  /** Why there is no suggestion. Null when there is one. */
  skipped: BonusSkipReason | null;
  status: BonusStatus;
  /** What the host granted. Zero until they say otherwise. */
  awarded: number;
  /** The requirement the host settled on, which can differ from the proposal. */
  requirement: BonusRequirement | null;
  /** The host's word on the decision, shown wherever the bonus is. */
  note: string;
  decidedAt: string | null;
}

/** A contribution that has never been near the bonus engine. */
export function emptyBonus(): BonusAward {
  return {
    suggested: null,
    skipped: null,
    status: "none",
    awarded: 0,
    requirement: null,
    note: "",
    decidedAt: null,
  };
}

/** Why a submission did or did not move the member's score. */
export const POINT_REASONS = [
  "valid_contribution",
  "new_angle_on_known_topic",
  "cycle_cap_reached",
  "duplicate",
  "rejected",
  "pending_evaluation",
  "blocked_source",
  "admin_override",
] as const;

export type PointReason = (typeof POINT_REASONS)[number];

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export interface Member {
  id: string;
  name: string;
  createdAt: string; // ISO
  active: boolean;
  /** Research direction the member picked. A hint only, never a restriction. */
  focusArea: NewsletterCategory | null;
  /** Self-service choice: show this member's name on public discovery cards. */
  showNameOnDiscoveries: boolean;
}

/** The acceptance floor from the product spec, one flag per requirement. */
export interface EligibilityChecks {
  aiRelated: boolean;
  specificInformation: boolean;
  usableSource: boolean;
  understandableFromSource: boolean;
  memberExplainedWhy: boolean;
  usefulKnowledge: boolean;
}

export interface EditorialBreakdown {
  aiRelevance: number;
  significance: number;
  usefulness: number;
  recency: number;
  sourceCredibility: number;
  audienceFit: number;
  uniqueness: number;
  newsletterValue: number;
}

export interface DuplicateFinding {
  outcome: DuplicateOutcome;
  /** Contribution this overlaps with, when there is one. */
  ofId: string | null;
  /** 0..1, how sure the evaluator is about that match. */
  confidence: number;
  reason: string;
  /** Every prior submission that was compared, strongest first. */
  matches: { id: string; title: string; memberName: string; score: number }[];
}

/** Facts pulled out of the source. Anything missing stays null, never invented. */
export interface ExtractedContent {
  title: string | null;
  source: string | null;
  sourceUrl: string | null;
  publicationDate: string | null;
  entity: string | null; // company / person / project behind it
  keyPoints: string[];
  capabilities: string[];
  practicalValue: string | null;
  links: string[];
}

export interface Evaluation {
  status: EvaluatedStatus;
  /** Present when the status is "rejected", null otherwise. */
  rejectionReason: string | null;
  eligibility: EligibilityChecks;

  classification: {
    primary: NewsletterCategory;
    secondary: NewsletterCategory[];
    reason: string;
  };

  audience: {
    tags: Audience[];
    reason: string;
  };

  difficulty: {
    level: Difficulty;
    prerequisites: string[];
  };

  duplicate: DuplicateFinding;

  verification: {
    status: VerificationStatus;
    /** Short bullets of what was actually checked, and where. */
    evidence: string[];
    /** Canonical/official source the evaluator settled on. */
    resolvedSource: string | null;
    /** Original publication date of the thing itself, not the submit date. */
    originalDate: string | null;
  };

  extracted: ExtractedContent;

  /** The evaluator's reading of the member's reason. Never overwrites it. */
  aiInterpretation: string;
  aiSummary: string;

  /**
   * Newsletter prioritisation only. Never shown to the member as "points"
   * and never read by the points engine.
   */
  editorial: {
    score: number; // 0..100
    rawScore: number; // before the duplicate/verification multipliers
    breakdown: EditorialBreakdown;
    notes: string[];
  };

  /** One or two sentences the member actually reads. */
  summaryForMember: string;

  engine: "ai" | "heuristic";
  model: string | null;
  evaluatedAt: string; // ISO
}

/** What the submission was worth to the member's leaderboard standing. */
export interface PointsAward {
  awarded: number;
  reason: PointReason;
  cycleKey: string;
  /** Points the member already held in that cycle when this was evaluated. */
  cycleTotalBefore: number;
}

export interface Contribution {
  id: string;
  memberId: string;
  memberName: string; // denormalised for simple reads
  title: string;
  url: string;
  /** One-line description of the link, written server-side. */
  description: string;
  /** The member's own words, preserved verbatim. */
  memberReason: string;
  /** Optional extra note from the member. */
  note: string;
  /** The research direction the member was working in. A hint, not a category. */
  focusArea: NewsletterCategory | null;

  createdAt: string; // ISO, when it was submitted
  cycleKey: string; // e.g. C0044, the newsletter cycle it belongs to
  weekKey: string; // e.g. 2026-W37
  monthKey: string; // e.g. 2026-09

  status: ContributionStatus;
  /** null while the status is "pending" or "blocked_source". */
  evaluation: Evaluation | null;
  points: PointsAward;

  /**
   * Set when there is no evaluation: the AI evaluation failed (kept so a retry
   * can explain itself) or the source refused us (what it answered, for the host).
   */
  evaluationError: string | null;
  evaluationAttempts: number;

  /**
   * The bonus the member's own writing earned, if any. Separate from `points`
   * because it is decided by a person, on its own timetable.
   */
  bonus: BonusAward;

  /** Set when an admin corrects the automatic result. AI is never final. */
  adminOverride: {
    status: ContributionStatus | null;
    points: number | null;
    primaryCategory: NewsletterCategory | null;
    duplicateOutcome: DuplicateOutcome | null;
    note: string;
    at: string;
  } | null;

  removed: boolean;
}

export interface Database {
  members: Member[];
  contributions: Contribution[];
  /** Newsletter issues, drafts and published, as structured data. */
  newsletters: NewsletterIssue[];
}

// ---------------------------------------------------------------------------
// Effective values, an admin correction always wins over the evaluator
// ---------------------------------------------------------------------------

export function effectiveStatus(c: Contribution): ContributionStatus {
  return c.adminOverride?.status ?? c.status;
}

export function effectivePoints(c: Contribution): number {
  if (c.removed) return 0;
  if (c.adminOverride?.points != null) return c.adminOverride.points;
  return c.points.awarded;
}

export function effectiveCategory(c: Contribution): NewsletterCategory | null {
  return (
    c.adminOverride?.primaryCategory ??
    c.evaluation?.classification.primary ??
    null
  );
}

export function effectiveDuplicate(c: Contribution): DuplicateOutcome {
  return (
    c.adminOverride?.duplicateOutcome ??
    c.evaluation?.duplicate.outcome ??
    "unique"
  );
}

/** Editorial value, for the newsletter engine. Deliberately not "points". */
export function editorialScore(c: Contribution): number {
  return c.evaluation?.editorial.score ?? 0;
}

/**
 * The bonus this contribution actually carries. A proposal is worth nothing
 * until a host confirms it, and a removed contribution carries nothing at all.
 *
 * This is per contribution. The once-per-cycle rule and the diversity bonus
 * are cycle-wide, so they live in services/bonus.ts, not here.
 */
export function effectiveBonus(c: Contribution): number {
  if (c.removed) return 0;
  return c.bonus?.status === "confirmed" ? c.bonus.awarded : 0;
}

/** Waiting on a host. This is what the admin queue is built from. */
export function bonusPending(c: Contribution): boolean {
  return !c.removed && c.bonus?.status === "pending";
}

export function isCounted(c: Contribution): boolean {
  return !c.removed && effectivePoints(c) > 0;
}

export type { EditorialDimension };
