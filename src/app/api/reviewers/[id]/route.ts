import { NextResponse } from "next/server";
import { adminRoute, readJson } from "@/lib/newsletter/http";
import { listReviewers, rotateReviewer, stopReviewer } from "@/lib/review/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** { action: "rotate" } issues a new link and voids the old; { action: "stop" } voids access. */
export async function PATCH(req: Request, { params }: Ctx) {
  return adminRoute(req, async () => {
    const { id } = await params;
    const body = await readJson(req);
    if (body.action === "rotate") {
      const rotated = await rotateReviewer(id);
      return NextResponse.json({ ...rotated, reviewers: await listReviewers() });
    }
    if (body.action === "stop") {
      await stopReviewer(id);
      return NextResponse.json({ reviewers: await listReviewers() });
    }
    return NextResponse.json({ error: "إجراء غير معروف." }, { status: 400 });
  });
}
