import { BONUS } from "@/lib/config/rules";
import {
  effectiveCategory,
  emptyBonus,
  type BonusAward,
  type BonusRequirement,
  type BonusSkipReason,
  type Contribution,
  type ContributionStatus,
  type NewsletterCategory,
} from "@/lib/db/schema";
import { isEarningStatus } from "./points";

/**
 * The bonus engine.
 *
 * Two rules hold the whole thing up. The first: a bonus is never granted apart
 * from the news it belongs to, so a paragraph of "why this matters" with no
 * real contribution under it is worth nothing at all, not half a point. The
 * second: the evaluator only ever proposes. Nothing here puts a bonus on the
 * board; only a host confirming it does that.
 */

/** What each requirement asks the member for, in the member's own language. */
export const REQUIREMENT_LABELS: Record<BonusRequirement, string> = {
  why_it_matters: "لماذا يهمك",
  who_is_it_for: "لمن يناسب",
  how_to_use: "كيفية الاستخدام",
  quick_example: "مثال سريع",
  takeaway: "المغزى",
};

export const SKIP_REASON_LABELS: Record<BonusSkipReason, string> = {
  no_valid_news: "لا بونص بلا خبر صحيح.",
  text_does_not_qualify: "نص العضو لا يستوفي شرط القسم.",
  already_earned_this_cycle: "بونص هذا النوع مُنح مرة في هذه الدورة.",
  no_category: "لا تصنيف بعد، فلا شرط بونص يُقاس عليه.",
};

export interface BonusRule {
  requirement: BonusRequirement;
  value: number;
}

/** What a section asks for, and what it pays. */
export function ruleForSection(
  category: NewsletterCategory | null,
): BonusRule | null {
  if (!category) return null;
  const rule = BONUS.bySection[category];
  return rule ? { requirement: rule.requirement, value: rule.value } : null;
}

/**
 * What a requirement pays, wherever it is asked for. Every requirement belongs
 * to one value even when two sections ask for it, so a host who changes the
 * requirement by hand gets the right number without having to know the table.
 */
export function valueForRequirement(requirement: BonusRequirement): number {
  for (const rule of Object.values(BONUS.bySection)) {
    if (rule.requirement === requirement) return rule.value;
  }
  return 0;
}

export function isOncePerCycle(requirement: BonusRequirement): boolean {
  return (BONUS.oncePerCycle as readonly string[]).includes(requirement);
}

/** The requirement a contribution is measured against, after any host edit. */
export function requirementFor(c: Contribution): BonusRequirement | null {
  return c.bonus?.requirement ?? ruleForSection(effectiveCategory(c))?.requirement ?? null;
}

/** What the evaluator said about the member's text, before any config is applied. */
export interface BonusSuggestion {
  /** Which section requirement the text satisfies. */
  requirement: BonusRequirement;
  /** One line in Arabic on what earned it. */
  reason: string;
}

function skip(reason: BonusSkipReason): BonusAward {
  return { ...emptyBonus(), skipped: reason };
}

export interface ProposeInput {
  suggestion: BonusSuggestion | null;
  status: ContributionStatus;
  category: NewsletterCategory | null;
  memberId: string;
  cycleKey: string;
  /** Everything already stored, so the once-per-cycle rule can be applied. */
  existing: Contribution[];
  /** The contribution being (re)proposed, excluded from the cycle scan. */
  selfId?: string;
}

/**
 * Turns the evaluator's opinion into a proposal a host can act on.
 *
 * Everything that can be decided mechanically is decided here, so the host is
 * only ever asked the question a person has to answer: is this text really
 * what it claims to be?
 */
export function proposeBonus(input: ProposeInput): BonusAward {
  // No bonus without a contribution under it. This covers rejected, duplicate,
  // pending and blocked submissions in one line.
  if (!isEarningStatus(input.status)) return skip("no_valid_news");

  const rule = ruleForSection(input.category);
  if (!rule) return skip("no_category");

  // The evaluator has to have seen the requirement met, and met for the
  // section the content actually landed in. A "how to use" on a news item is
  // not a tools bonus.
  if (!input.suggestion || input.suggestion.requirement !== rule.requirement) {
    return skip("text_does_not_qualify");
  }

  if (
    isOncePerCycle(rule.requirement) &&
    alreadyClaimed(rule.requirement, input)
  ) {
    return skip("already_earned_this_cycle");
  }

  return {
    ...emptyBonus(),
    suggested: {
      requirement: rule.requirement,
      value: rule.value,
      reason: input.suggestion.reason.trim(),
    },
    status: "pending",
  };
}

/**
 * Has this member already been put forward for this requirement in this cycle?
 *
 * A pending proposal counts: two proposals for the same thing would leave a
 * host choosing between them for no reason.
 */
function alreadyClaimed(
  requirement: BonusRequirement,
  input: ProposeInput,
): boolean {
  return input.existing.some(
    (c) =>
      !c.removed &&
      c.id !== input.selfId &&
      c.memberId === input.memberId &&
      c.cycleKey === input.cycleKey &&
      (c.bonus?.status === "pending" || c.bonus?.status === "confirmed") &&
      (c.bonus.requirement ?? c.bonus.suggested?.requirement) === requirement,
  );
}

// ---------------------------------------------------------------------------
// The cycle view: what a member's confirmed bonuses are actually worth
// ---------------------------------------------------------------------------

export interface CycleBonus {
  /** Confirmed and payable, per contribution id. */
  paid: Map<string, number>;
  /** Confirmed but not paid, because the cycle already paid for that one. */
  unpaid: Map<string, number>;
  /** Sum of the payable section bonuses. */
  sectionPoints: number;
  /** Distinct sections among confirmed bonuses, which is what earns diversity. */
  sections: NewsletterCategory[];
  diversityPoints: number;
  total: number;
}

/**
 * Everything one member's confirmed bonuses come to in one cycle.
 *
 * The once-per-cycle rule is settled here, not at confirmation time, so that
 * re-categorising or un-removing a contribution can never leave two tool
 * bonuses paid at once. Oldest first, so the member keeps the one they earned
 * first if a host confirms them out of order.
 */
export function cycleBonusFor(
  memberId: string,
  contributions: Contribution[],
  cycleKey: string,
): CycleBonus {
  const mine = contributions
    .filter(
      (c) =>
        !c.removed &&
        c.memberId === memberId &&
        c.cycleKey === cycleKey &&
        c.bonus?.status === "confirmed",
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const paid = new Map<string, number>();
  const unpaid = new Map<string, number>();
  const claimed = new Set<BonusRequirement>();
  const sections = new Set<NewsletterCategory>();

  for (const c of mine) {
    const category = effectiveCategory(c);
    if (category) sections.add(category);

    const requirement = requirementFor(c);
    const value = c.bonus.awarded;
    if (value <= 0) continue;

    if (requirement && isOncePerCycle(requirement)) {
      if (claimed.has(requirement)) {
        unpaid.set(c.id, value);
        continue;
      }
      claimed.add(requirement);
    }
    paid.set(c.id, value);
  }

  const sectionPoints = [...paid.values()].reduce((a, b) => a + b, 0);
  const diversityPoints =
    sections.size >= BONUS.diversity.sections ? BONUS.diversity.value : 0;

  return {
    paid,
    unpaid,
    sectionPoints,
    sections: [...sections],
    diversityPoints,
    total: sectionPoints + diversityPoints,
  };
}
