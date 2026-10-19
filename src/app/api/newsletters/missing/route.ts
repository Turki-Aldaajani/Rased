import { NextResponse } from "next/server";
import { readDb } from "@/lib/db/store";
import { adminRoute, readJson } from "@/lib/newsletter/http";
import { isSectionId } from "@/lib/newsletter/sections";
import { addToCycleIssue, missingFromNewsletter } from "@/lib/newsletter/service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** «لم تدخل النشرة»: accepted contributions that are in no issue of their cycle. */
export async function GET(req: Request) {
  return adminRoute(req, async () => {
    // Loads any host-set cycle end before cycles are labelled.
    await readDb();
    return NextResponse.json({ cycles: await missingFromNewsletter() });
  });
}

/** Adds one of them to its own cycle's issue, in the section the host picked. */
export async function POST(req: Request) {
  return adminRoute(req, async () => {
    const body = await readJson(req);
    const contributionId = String(body.contributionId ?? "");
    if (!contributionId || !isSectionId(body.sectionId)) {
      return NextResponse.json({ error: "اختر مساهمة وقسمًا." }, { status: 400 });
    }
    const { issue, error } = await addToCycleIssue(contributionId, body.sectionId, {
      confirmPublishedEdit: body.confirmPublishedEdit === true,
    });
    return NextResponse.json({
      issueNumber: issue.number,
      published: issue.status === "published",
      regenerateError: error,
      cycles: await missingFromNewsletter(),
    });
  });
}
