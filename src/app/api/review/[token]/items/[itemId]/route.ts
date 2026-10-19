import { NextResponse } from "next/server";
import { readJson } from "@/lib/newsletter/http";
import { reviewRoute } from "@/lib/review/http";
import { saveAsReviewer } from "@/lib/review/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string; itemId: string }> };

/** Saves one card. Fields outside the reviewer's role are ignored on the server. */
export async function POST(req: Request, { params }: Ctx) {
  return reviewRoute(async () => {
    const { token, itemId } = await params;
    const body = await readJson(req);
    const fields =
      body.fields && typeof body.fields === "object" ? (body.fields as Record<string, unknown>) : {};
    return NextResponse.json(
      await saveAsReviewer(token, itemId, { fields, fresh: body.fresh === true }),
    );
  });
}
