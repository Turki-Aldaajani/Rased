import { POINTS } from "@/lib/config/rules";
import type {
  Contribution,
  ContributionStatus,
  Evaluation,
  PointReason,
  PointsAward,
} from "@/lib/db/schema";
import { effectivePoints } from "@/lib/db/schema";

/**
 * The member-points engine.
 *
 * It reads exactly three things: whether the contribution is valid, whether it
 * duplicates an earlier one, and how many points the member already holds in
 * this cycle. It never reads the editorial score, the category, the source or
 * the subject, a beginner's learning resource and a frontier model release
 * are worth the same +1.
 */

/** Statuses that earn a point, before the per-cycle cap is applied. */
const EARNING_STATUSES: ContributionStatus[] = [
  "accepted",
  "accepted_with_new_angle",
];

export function isEarningStatus(status: ContributionStatus): boolean {
  return EARNING_STATUSES.includes(status);
}

/** Points a member already holds inside one cycle. Admin overrides included. */
export function cyclePointsFor(
  memberId: string,
  contributions: Contribution[],
  cycleKey: string,
): number {
  return contributions
    .filter(
      (c) => !c.removed && c.memberId === memberId && c.cycleKey === cycleKey,
    )
    .reduce((sum, c) => sum + effectivePoints(c), 0);
}

export interface PointsDecision extends PointsAward {
  /** Plain-Arabic explanation shown to the member. */
  explanation: string;
}

export function decidePoints(
  status: ContributionStatus,
  cycleKey: string,
  cycleTotalBefore: number,
): PointsDecision {
  const base = { cycleKey, cycleTotalBefore };

  if (status === "pending") {
    return {
      ...base,
      awarded: 0,
      reason: "pending_evaluation" as PointReason,
      explanation:
        "لم يكتمل التقييم بعد، لذا لم تُحتسب نقطة. المساهمة محفوظة ويمكن إعادة تقييمها.",
    };
  }
  if (status === "blocked_source") {
    return {
      ...base,
      awarded: 0,
      reason: "blocked_source",
      explanation:
        "المصدر يمنع الوصول الآلي، لذا لم تُحتسب نقطة بعد. ستُحتسب إن أقرّها المضيف بعد مراجعتها يدويًا.",
    };
  }
  if (status === "rejected") {
    return {
      ...base,
      awarded: 0,
      reason: "rejected",
      explanation: "لم تستوفِ المساهمة الحد الأدنى للقبول، لذا لم تُحتسب نقطة.",
    };
  }
  if (status === "duplicate") {
    return {
      ...base,
      awarded: 0,
      reason: "duplicate",
      explanation:
        "سبق أن أُرسل المحتوى نفسه، لذا لم تُحتسب نقطة جديدة. المساهمة تبقى محفوظة للنشرة.",
    };
  }

  if (cycleTotalBefore >= POINTS.maxBasePerCycle) {
    return {
      ...base,
      awarded: 0,
      reason: "cycle_cap_reached",
      explanation: `مساهمة صحيحة، لكنك بلغت الحد الأقصى ${POINTS.maxBasePerCycle} نقاط في هذه الدورة. تبقى المساهمة محفوظة وقد تدخل النشرة.`,
    };
  }

  return {
    ...base,
    awarded: POINTS.perValidContribution,
    reason:
      status === "accepted_with_new_angle"
        ? "new_angle_on_known_topic"
        : "valid_contribution",
    explanation:
      status === "accepted_with_new_angle"
        ? "الموضوع مطروق سابقًا لكن مساهمتك تضيف قيمة جديدة، فاحتُسبت نقطة."
        : "مساهمة جديدة وصحيحة، فاحتُسبت نقطة.",
  };
}

/** Derives the stored status from a completed evaluation. */
export function statusFromEvaluation(e: Evaluation): ContributionStatus {
  return e.status;
}
