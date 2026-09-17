import { NextResponse } from "next/server";
import { adminRoute, readJson } from "@/lib/newsletter/http";
import {
  availableCycles,
  createDraft,
  listIssueSummaries,
} from "@/lib/newsletter/service";
import { cycleKey } from "@/lib/util/date";

export const dynamic = "force-dynamic";
// Six sections are written in parallel; a slow model can take a while.
export const maxDuration = 300;

export async function GET(req: Request) {
  return adminRoute(req, async () => {
    const [summaries, cycles] = await Promise.all([
      listIssueSummaries(),
      availableCycles(),
    ]);
    return NextResponse.json({
      ...summaries,
      cycles,
      currentCycle: cycleKey(new Date()),
    });
  });
}

/** "Generate Newsletter" for a cycle — always a draft, never a publication. */
export async function POST(req: Request) {
  return adminRoute(req, async () => {
    const body = await readJson(req);
    const cycle = String(body.cycle ?? "").trim();
    if (!/^C\d{4}$/.test(cycle)) {
      return NextResponse.json({ error: "اختر دورة صحيحة." }, { status: 400 });
    }
    const issue = await createDraft(cycle);
    return NextResponse.json({ issue }, { status: 201 });
  });
}
