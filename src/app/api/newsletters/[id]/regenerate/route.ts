import { NextResponse } from "next/server";
import { adminRoute, readJson } from "@/lib/newsletter/http";
import { isSectionId } from "@/lib/newsletter/sections";
import {
  getIssueWithContext,
  regenerate,
  type RegenerateScope,
} from "@/lib/newsletter/service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  return adminRoute(req, async () => {
    const { id } = await params;
    const body = await readJson(req);

    let request: RegenerateScope;
    if (body.scope === "issue") {
      request = { scope: "issue" };
    } else if (body.scope === "section" && isSectionId(body.sectionId)) {
      request = { scope: "section", sectionId: body.sectionId };
    } else if (body.scope === "item" && typeof body.itemId === "string") {
      request = { scope: "item", itemId: body.itemId };
    } else {
      return NextResponse.json(
        { error: "نطاق إعادة التوليد غير صالح." },
        { status: 400 },
      );
    }

    const { error } = await regenerate(id, request);
    // A failed run still returns the (unchanged) draft, plus the error.
    return NextResponse.json({
      ...(await getIssueWithContext(id)),
      regenerateError: error,
    });
  });
}
