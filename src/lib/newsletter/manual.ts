import {
  effectiveCategory,
  effectiveStatus,
  type Contribution,
  type Database,
  type NewsletterCategory,
} from "@/lib/db/schema";
import { isEarningStatus } from "@/lib/services/points";
import { cycleLabel } from "@/lib/util/date";
import { LEGACY_ISSUES } from "./legacy";
import type { IssueStatus, UnusedReason } from "./types";

/**
 * Manual placement: a host deciding that an accepted contribution belongs in
 * the newsletter, whatever the automatic selection made of it.
 *
 * Unlike `eligibleFor` in select.ts, nothing here asks for an evaluation, a
 * category or the editorial floor. A contribution accepted by hand after its
 * evaluation failed has none of those, and the card is built from its title
 * and the member's own words instead. The automatic selection is untouched.
 */

/** Accepted (by the evaluator or by a host) and not removed. */
export function manuallyAddable(c: Contribution): boolean {
  return !c.removed && isEarningStatus(effectiveStatus(c));
}

export interface AddRefusal {
  message: string;
  status: number;
}

/**
 * Why a contribution may not be added by hand, or null when it may. Pass the
 * issue's cycle to also require the contribution to belong to it.
 */
export function manualAddRefusal(
  c: Contribution | undefined,
  cycleKey?: string,
): AddRefusal | null {
  if (!c || c.removed) return { message: "المساهمة غير متاحة.", status: 404 };
  if (!isEarningStatus(effectiveStatus(c))) {
    return { message: "المساهمة غير مقبولة، فلا تدخل النشرة.", status: 422 };
  }
  if (cycleKey !== undefined && c.cycleKey !== cycleKey) {
    return { message: "المساهمة من دورة أخرى.", status: 422 };
  }
  return null;
}

const UNUSED_LABELS: Record<UnusedReason, string> = {
  section_full: "القسم ممتلئ",
  same_event: "الحدث نفسه",
  below_threshold: "أقل من الحد التحريري",
  duplicate_url: "المصدر نفسه مختار مسبقًا",
  removed_by_editor: "أزالها المحرر",
  stale: "غير حديث",
};

/** When the contribution became accepted, as near as the record tells. */
function acceptedAt(c: Contribution): string {
  if (c.adminOverride?.status && isEarningStatus(c.adminOverride.status)) {
    return c.adminOverride.at;
  }
  return c.evaluation?.evaluatedAt ?? c.createdAt;
}

export interface MissingItem {
  contributionId: string;
  title: string;
  memberName: string;
  category: NewsletterCategory | null;
  reason: string;
}

export interface MissingCycle {
  cycleKey: string;
  label: string;
  /** The cycle's issue, or null when none has been created yet. */
  issue: { id: string; number: number; status: IssueStatus } | null;
  items: MissingItem[];
}

/**
 * Accepted contributions that sit in no issue of their own cycle, grouped by
 * cycle, newest first. A cycle with nothing missing is left out, and so is a
 * cycle published by hand before this system (its items are not tracked).
 */
export function notInNewsletter(db: Database): MissingCycle[] {
  const legacy = new Set(LEGACY_ISSUES.map((l) => l.cycleKey));
  const groups = new Map<string, MissingCycle>();

  for (const c of db.contributions) {
    if (!manuallyAddable(c) || legacy.has(c.cycleKey)) continue;
    const issues = db.newsletters.filter((n) => n.cycleKey === c.cycleKey);
    const placed = issues.some((n) =>
      n.sections.some((s) => s.items.some((i) => i.contributionId === c.id)),
    );
    if (placed) continue;

    const issue = issues[0] ?? null;
    const unused = issues.flatMap((n) => n.unused).find((u) => u.contributionId === c.id);
    const reason = unused
      ? UNUSED_LABELS[unused.reason]
      : !c.evaluation
        ? "بلا تقييم آلي"
        : effectiveCategory(c) === null
          ? "بلا تصنيف"
          : !issue
            ? "لا يوجد عدد لهذه الدورة"
            : acceptedAt(c) > issue.createdAt
              ? "قُبلت بعد إنشاء العدد"
              : "لم يخترها العدد";

    const group = groups.get(c.cycleKey) ?? {
      cycleKey: c.cycleKey,
      label: cycleLabel(c.cycleKey),
      issue: issue && { id: issue.id, number: issue.number, status: issue.status },
      items: [],
    };
    group.items.push({
      contributionId: c.id,
      title: c.title,
      memberName: c.memberName,
      category: effectiveCategory(c),
      reason,
    });
    groups.set(c.cycleKey, group);
  }

  return [...groups.values()].sort((a, b) => b.cycleKey.localeCompare(a.cycleKey));
}
