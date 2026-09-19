import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/newsletter/http";
import { cycleOverview } from "@/lib/newsletter/service";
import { cycleKey } from "@/lib/util/date";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return adminRoute(req, async () => {
    const requested = new URL(req.url).searchParams.get("cycle") ?? "";
    const cycle = /^C\d{4}$/.test(requested) ? requested : cycleKey(new Date());
    return NextResponse.json(await cycleOverview(cycle));
  });
}
