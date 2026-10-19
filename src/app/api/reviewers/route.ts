import { NextResponse } from "next/server";
import { adminRoute, readJson } from "@/lib/newsletter/http";
import { addReviewer, isReviewerRole, listReviewers } from "@/lib/review/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return adminRoute(req, async () => NextResponse.json({ reviewers: await listReviewers() }));
}

/** Adds a reviewer. The token comes back once, in this answer only. */
export async function POST(req: Request) {
  return adminRoute(req, async () => {
    const body = await readJson(req);
    if (!isReviewerRole(body.role)) {
      return NextResponse.json({ error: "اختر دور المراجع." }, { status: 400 });
    }
    const added = await addReviewer(String(body.name ?? ""), body.role);
    return NextResponse.json({ ...added, reviewers: await listReviewers() });
  });
}
