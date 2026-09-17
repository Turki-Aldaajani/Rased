import { NextResponse } from "next/server";
import { POINTS } from "@/lib/config/rules";
import {
  CONTRIBUTION_STATUSES,
  DUPLICATE_OUTCOMES,
  NEWSLETTER_CATEGORIES,
  type ContributionStatus,
  type DuplicateOutcome,
  type NewsletterCategory,
} from "@/lib/db/schema";
import { getContribution, updateContribution } from "@/lib/db/store";
import { requireAdmin } from "@/lib/services/admin";
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
      : clamp(Math.round(Number(body.points)), 0, POINTS.maxPerCycle);

  const updated = await updateContribution(id, {
    removed: body.removed ?? current.removed,
    adminOverride: {
      status: status ?? current.adminOverride?.status ?? null,
      points,
      primaryCategory:
        primaryCategory ?? current.adminOverride?.primaryCategory ?? null,
      duplicateOutcome:
        duplicateOutcome ?? current.adminOverride?.duplicateOutcome ?? null,
      note: (body.note ?? current.adminOverride?.note ?? "").trim(),
      at: new Date().toISOString(),
    },
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
