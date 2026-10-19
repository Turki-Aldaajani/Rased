import { NextResponse } from "next/server";
import { reviewRoute } from "@/lib/review/http";
import { markStale } from "@/lib/review/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string; itemId: string }> };

/** Content checker: "غير حديث" takes the card out of the draft. */
export async function POST(_req: Request, { params }: Ctx) {
  return reviewRoute(async () => {
    const { token, itemId } = await params;
    await markStale(token, itemId);
    return NextResponse.json({ ok: true });
  });
}
