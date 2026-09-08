import { NextResponse } from "next/server";
import {
  CONTRIBUTION_TYPES,
  type Contribution,
  type ContributionType,
} from "@/lib/db/schema";
import {
  getMember,
  listAllContributions,
  listContributions,
  newId,
  saveContributionGuarded,
} from "@/lib/db/store";
import { applyLateDuplicate } from "@/lib/services/duplicates";
import { evaluateContribution } from "@/lib/services/evaluate";
import { autoLabel } from "@/lib/services/title";
import { monthKey, weekKey } from "@/lib/util/date";
import { sameResource } from "@/lib/util/text";

export const dynamic = "force-dynamic";
// Web verification plus an AI evaluation can take a while.
export const maxDuration = 120;

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const memberId = params.get("memberId");
  const includeRemoved = params.get("all") === "1";
  let contributions = includeRemoved
    ? await listAllContributions()
    : await listContributions();
  if (memberId) {
    contributions = contributions.filter((c) => c.memberId === memberId);
  }
  return NextResponse.json({ contributions });
}

interface SubmitBody {
  memberId?: string;
  title?: string;
  url?: string;
  description?: string;
  whyUseful?: string;
  type?: string;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as SubmitBody;

  const memberId = (body.memberId ?? "").trim();
  const url = (body.url ?? "").trim();
  const description = (body.description ?? "").trim();
  const whyUseful = (body.whyUseful ?? "").trim();

  if (!memberId) {
    return NextResponse.json(
      { error: "Pick who you are before submitting." },
      { status: 400 },
    );
  }
  if (!url) {
    return NextResponse.json(
      { error: "A URL or source is required." },
      { status: 400 },
    );
  }
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error("bad protocol");
  } catch {
    return NextResponse.json(
      { error: "That URL does not look valid. It should start with https://" },
      { status: 400 },
    );
  }
  const member = await getMember(memberId);
  if (!member) {
    return NextResponse.json(
      { error: "That team member no longer exists." },
      { status: 404 },
    );
  }

  // Title and type are optional: the composer normally has them already from
  // /api/title, and anything else gets named here instead of asking the member.
  let title = (body.title ?? "").trim();
  let type = (body.type ?? "") as ContributionType;
  if (!title || !CONTRIBUTION_TYPES.includes(type)) {
    const label = await autoLabel(url, whyUseful || description);
    if (!title) title = label.title;
    if (!CONTRIBUTION_TYPES.includes(type)) type = label.type;
  }

  const existing = await listContributions();

  let result;
  try {
    result = await evaluateContribution(
      { title, url, description, whyUseful, type, memberName: member.name },
      existing,
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: `Evaluation failed: ${(err as Error)?.message ?? "unknown error"}`,
      },
      { status: 502 },
    );
  }

  const now = new Date();
  const contribution: Contribution = {
    id: newId(),
    memberId: member.id,
    memberName: member.name,
    title,
    url,
    description,
    whyUseful,
    type,
    createdAt: now.toISOString(),
    weekKey: weekKey(now),
    monthKey: monthKey(now),
    evaluation: result.evaluation,
    adminOverride: null,
    removed: false,
  };

  // Guarded save: catches the case where someone submitted the same link while
  // this one was still being evaluated.
  const saved = await saveContributionGuarded(
    contribution,
    (a, b) => sameResource(a.url, b.url),
    applyLateDuplicate,
  );

  return NextResponse.json(
    { contribution: saved, notices: result.notices },
    { status: 201 },
  );
}
