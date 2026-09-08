import { NextResponse } from "next/server";
import type { DuplicateStatus } from "@/lib/db/schema";
import { getContribution, updateContribution } from "@/lib/db/store";
import { requireAdmin } from "@/lib/services/admin";
import { clamp } from "@/lib/util/text";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const contribution = await getContribution(id);
  if (!contribution) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ contribution });
}

/** Admin override — the AI is the default, a human has the last word. */
export async function PATCH(req: Request, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { id } = await params;
  const current = await getContribution(id);
  if (!current) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    score?: number | null;
    duplicate?: DuplicateStatus | null;
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

  const score =
    body.score == null || Number.isNaN(Number(body.score))
      ? (current.adminOverride?.score ?? null)
      : clamp(Math.round(Number(body.score)), 0, 100);

  const duplicate =
    body.duplicate ?? current.adminOverride?.duplicate ?? null;

  const updated = await updateContribution(id, {
    removed: body.removed ?? current.removed,
    adminOverride: {
      score,
      duplicate,
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
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
