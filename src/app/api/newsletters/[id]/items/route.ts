import { NextResponse } from "next/server";
import { adminRoute, readJson } from "@/lib/newsletter/http";
import { isSectionId } from "@/lib/newsletter/sections";
import { addItem, getIssueWithContext } from "@/lib/newsletter/service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

/** Adds a contribution from the cycle to a section, and writes it. */
export async function POST(req: Request, { params }: Ctx) {
  return adminRoute(req, async () => {
    const { id } = await params;
    const body = await readJson(req);
    const contributionId = String(body.contributionId ?? "");
    if (!contributionId || !isSectionId(body.sectionId)) {
      return NextResponse.json({ error: "اختر مساهمة وقسمًا." }, { status: 400 });
    }
    const { error } = await addItem(id, contributionId, body.sectionId);
    return NextResponse.json({
      ...(await getIssueWithContext(id)),
      regenerateError: error,
    });
  });
}
