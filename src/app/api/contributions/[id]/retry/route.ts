import { NextResponse } from "next/server";
import { effectiveStatus } from "@/lib/db/schema";
import { getContribution, listContributions } from "@/lib/db/store";
import { reevaluateContribution } from "@/lib/services/submit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Retries a contribution whose evaluation failed.
 *
 * Open to the member who submitted it, not just the admin: an evaluator
 * outage is not their fault, and the point is owed to them once it succeeds.
 * Only pending submissions can be retried, so this cannot be used to re-roll
 * a result someone did not like.
 */
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const current = await getContribution(id);
  if (!current) {
    return NextResponse.json({ error: "غير موجود." }, { status: 404 });
  }
  if (effectiveStatus(current) === "blocked_source") {
    // The source refuses machine reads, so a retry would meet the same wall.
    return NextResponse.json(
      { error: "هذه المساهمة تنتظر مراجعة المضيف اليدوية." },
      { status: 409 },
    );
  }
  if (effectiveStatus(current) !== "pending") {
    return NextResponse.json(
      { error: "هذه المساهمة مُقيَّمة بالفعل." },
      { status: 409 },
    );
  }

  const existing = await listContributions();
  const { contribution, notices } = await reevaluateContribution(
    current,
    existing,
  );

  return NextResponse.json({ contribution, notices });
}
