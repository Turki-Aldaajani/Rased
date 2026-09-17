import type {
  Contribution,
  Member,
  NewsletterCategory,
} from "@/lib/db/schema";
import { saveWithAward, newId, replaceWithAward } from "@/lib/db/store";
import { applyLateDuplicate } from "./duplicates";
import { evaluateContribution } from "./evaluate";
import { decidePoints } from "./points";
import { autoLabel } from "./title";
import { cycleKey, monthKey, weekKey } from "@/lib/util/date";
import { sameResource } from "@/lib/util/text";

/**
 * The submission pipeline, shared by the submit route and the retry route.
 *
 * Its contract, from the product spec: a submission is never lost. If the
 * evaluator cannot be reached the contribution is stored `pending` with the
 * error attached, earns nothing, and can be retried later.
 */

export interface SubmitInput {
  member: Member;
  url: string;
  title: string;
  memberReason: string;
  note: string;
  focusArea: NewsletterCategory | null;
}

export interface SubmitResult {
  contribution: Contribution;
  notices: string[];
}

export async function submitContribution(
  input: SubmitInput,
  existing: Contribution[],
): Promise<SubmitResult> {
  // The member never writes a title; whatever the composer did not name
  // already, we name here.
  let title = input.title.trim();
  let description = "";
  if (!title) {
    const label = await autoLabel(input.url, input.memberReason);
    title = label.title;
    description = label.summary;
  }

  const outcome = await evaluateContribution(
    {
      title,
      url: input.url,
      description,
      memberReason: input.memberReason,
      note: input.note,
      focusArea: input.focusArea,
      memberName: input.member.name,
    },
    existing,
  );

  if (!description) {
    description = outcome.evaluation?.aiSummary ?? "";
  }

  const now = new Date();
  const cycle = cycleKey(now);
  const status = outcome.evaluation?.status ?? "pending";

  const draft: Contribution = {
    id: newId(),
    memberId: input.member.id,
    memberName: input.member.name,
    title,
    url: input.url,
    description,
    memberReason: input.memberReason,
    note: input.note,
    focusArea: input.focusArea,
    createdAt: now.toISOString(),
    cycleKey: cycle,
    weekKey: weekKey(now),
    monthKey: monthKey(now),
    status,
    evaluation: outcome.evaluation,
    points: {
      awarded: 0,
      reason: "pending_evaluation",
      cycleKey: cycle,
      cycleTotalBefore: 0,
    },
    evaluationError: outcome.error,
    evaluationAttempts: 1,
    adminOverride: null,
    removed: false,
  };

  const saved = await saveWithAward(
    draft,
    (a, b) => sameResource(a.url, b.url),
    (c, ctx) => {
      // Someone pasted the same link while this one was being evaluated.
      const resolved = ctx.collision ? applyLateDuplicate(c, ctx.collision) : c;
      const decision = decidePoints(
        resolved.status,
        resolved.cycleKey,
        ctx.cycleTotalBefore,
      );
      return {
        ...resolved,
        points: {
          awarded: decision.awarded,
          reason: decision.reason,
          cycleKey: decision.cycleKey,
          cycleTotalBefore: decision.cycleTotalBefore,
        },
      };
    },
  );

  return { contribution: saved, notices: outcome.notices };
}

/**
 * Re-runs the evaluation of a stored contribution and awards its point if it
 * now passes. Used for pending submissions after an evaluator outage.
 */
export async function reevaluateContribution(
  current: Contribution,
  existing: Contribution[],
): Promise<SubmitResult> {
  const outcome = await evaluateContribution(
    {
      title: current.title,
      url: current.url,
      description: current.description,
      memberReason: current.memberReason,
      note: current.note,
      focusArea: current.focusArea,
      memberName: current.memberName,
    },
    existing.filter((c) => c.id !== current.id),
  );

  const updated = await replaceWithAward(current.id, (c, ctx) => {
    const status = outcome.evaluation?.status ?? "pending";
    const withEval: Contribution = {
      ...c,
      status,
      evaluation: outcome.evaluation ?? c.evaluation,
      evaluationError: outcome.error,
      evaluationAttempts: c.evaluationAttempts + 1,
      description: c.description || (outcome.evaluation?.aiSummary ?? ""),
    };
    const resolved =
      ctx.collision && outcome.evaluation
        ? applyLateDuplicate(withEval, ctx.collision)
        : withEval;
    const decision = decidePoints(
      resolved.status,
      resolved.cycleKey,
      ctx.cycleTotalBefore,
    );
    return {
      ...resolved,
      points: {
        awarded: decision.awarded,
        reason: decision.reason,
        cycleKey: decision.cycleKey,
        cycleTotalBefore: decision.cycleTotalBefore,
      },
    };
  });

  return {
    contribution: updated ?? current,
    notices: outcome.notices,
  };
}
