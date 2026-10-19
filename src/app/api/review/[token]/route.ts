import { NextResponse } from "next/server";
import { reviewRoute } from "@/lib/review/http";
import { reviewPage } from "@/lib/review/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/** The reviewer, their task, and the current draft's sections for their role. */
export async function GET(_req: Request, { params }: Ctx) {
  return reviewRoute(async () => {
    const { token } = await params;
    return NextResponse.json(await reviewPage(token));
  });
}
