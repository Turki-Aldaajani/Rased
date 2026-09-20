import { NextResponse } from "next/server";
import { BONUS, POINTS } from "@/lib/config/rules";
import {
  BONUS_REQUIREMENTS,
  CONTRIBUTION_STATUSES,
  DUPLICATE_OUTCOMES,
  NEWSLETTER_CATEGORIES,
  effectiveCategory,
  type BonusAward,
  type BonusRequirement,
  type Contribution,
  type ContributionStatus,
  type DuplicateOutcome,
  type NewsletterCategory,
} from "@/lib/db/schema";
import { getContribution, updateContribution } from "@/lib/db/store";
import { requireAdmin } from "@/lib/services/admin";
import { ruleForSection, valueForRequirement } from "@/lib/services/bonus";
import { clamp } from "@/lib/util/text";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const contribution = await getContribution(id);
  if (!contribution) {
    return NextResponse.json({ error: "غير موجود." }, { status: 404 });
  }
  return NextResponse.json({ contribution });
}

/**
 * Admin correction. The evaluation is never final: a human can change the
 * status, the points, the category and the duplicate call, and can restore
 * anything that was rejected or removed.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { id } = await params;
  const current = await getContribution(id);
  if (!current) {
    return NextResponse.json({ error: "غير موجود." }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    status?: string | null;
    points?: number | null;
    primaryCategory?: string | null;
    duplicateOutcome?: string | null;
    note?: string;
    removed?: boolean;
    clear?: boolean;
    bonus?: {
      decision?: string;
      requirement?: string | null;
      value?: number | null;
      note?: string;
    };
  };

  if (body.clear) {
    const updated = await updateContribution(id, {
      adminOverride: null,
      removed: body.removed ?? current.removed,
    });
    return NextResponse.json({ contribution: updated });
  }

  const status = pick(body.status, CONTRIBUTION_STATUSES) as
    | ContributionStatus
    | null;
  const primaryCategory = pick(
    body.primaryCategory,
    NEWSLETTER_CATEGORIES,
  ) as NewsletterCategory | null;
  const duplicateOutcome = pick(
    body.duplicateOutcome,
    DUPLICATE_OUTCOMES,
  ) as DuplicateOutcome | null;

  const points =
    body.points == null || Number.isNaN(Number(body.points))
      ? (current.adminOverride?.points ?? null)
      : clamp(Math.round(Number(body.points)), 0, POINTS.maxBasePerCycle);

  const bonus = body.bonus
    ? decideBonus(current, body.bonus, primaryCategory)
    : current.bonus;

  // Deciding a bonus is not correcting an evaluation. A request that only
  // carries a bonus must not stamp an empty override onto the contribution
  // and mark it "corrected by the host" for nothing.
  const correcting =
    body.status !== undefined ||
    body.points !== undefined ||
    body.primaryCategory !== undefined ||
    body.duplicateOutcome !== undefined ||
    body.note !== undefined;

  const updated = await updateContribution(id, {
    removed: body.removed ?? current.removed,
    bonus,
    adminOverride: correcting
      ? {
          status: status ?? current.adminOverride?.status ?? null,
          points,
          primaryCategory:
            primaryCategory ?? current.adminOverride?.primaryCategory ?? null,
          duplicateOutcome:
            duplicateOutcome ?? current.adminOverride?.duplicateOutcome ?? null,
          note: (body.note ?? current.adminOverride?.note ?? "").trim(),
          at: new Date().toISOString(),
        }
      : current.adminOverride,
  });

  return NextResponse.json({ contribution: updated });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { id } = await params;
  const updated = await updateContribution(id, { removed: true });
  if (!updated) {
    return NextResponse.json({ error: "غير موجود." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

function pick(value: unknown, allowed: readonly string[]): string | null {
  const v = String(value ?? "").trim();
  return allowed.includes(v) ? v : null;
}

/**
 * The host's word on a proposed bonus.
 *
 * Confirming takes the requirement of the section the contribution is actually
 * in, not the one the model guessed, so correcting the category in the same
 * save corrects what the bonus pays. A host who types a value gets that value,
 * up to the manual ceiling.
 *
 * Nothing here enforces the once-per-cycle rule: that is settled on the board,
 * where the whole cycle is visible, so confirming bonuses out of order or
 * un-removing a contribution can never pay for the same thing twice.
 */
function decideBonus(
  current: Contribution,
  body: NonNullable<{ decision?: string; requirement?: string | null; value?: number | null; note?: string }>,
  categoryOverride: NewsletterCategory | null,
): BonusAward {
  const decision = String(body.decision ?? "").trim();
  const note = (body.note ?? current.bonus.note ?? "").trim().slice(0, 200);

  if (decision === "reject") {
    return {
      ...current.bonus,
      status: "rejected",
      awarded: 0,
      note,
      decidedAt: new Date().toISOString(),
    };
  }

  if (decision === "reset") {
    return {
      ...current.bonus,
      status: current.bonus.suggested ? "pending" : "none",
      awarded: 0,
      requirement: null,
      note: "",
      decidedAt: null,
    };
  }

  if (decision !== "confirm") return current.bonus;

  const category =
    categoryOverride ??
    effectiveCategory(current) ??
    null;
  const asked = pick(body.requirement, BONUS_REQUIREMENTS) as
    | BonusRequirement
    | null;
  const requirement =
    asked ??
    ruleForSection(category)?.requirement ??
    current.bonus.suggested?.requirement ??
    null;

  if (!requirement) return current.bonus;

  const value =
    body.value == null || Number.isNaN(Number(body.value))
      ? valueForRequirement(requirement)
      : clamp(Number(body.value), 0, BONUS.maxManual);

  return {
    ...current.bonus,
    status: "confirmed",
    requirement,
    awarded: value,
    note,
    decidedAt: new Date().toISOString(),
  };
}
