import { NextResponse } from "next/server";
import { ACCEPTANCE } from "@/lib/config/rules";
import {
  NEWSLETTER_CATEGORIES,
  effectiveStatus,
  type NewsletterCategory,
} from "@/lib/db/schema";
import {
  getMember,
  listAllContributions,
  listContributions,
} from "@/lib/db/store";
import { submitContribution } from "@/lib/services/submit";
import { meaningfulWordCount } from "@/lib/util/text";

export const dynamic = "force-dynamic";
// Web verification plus an AI evaluation can take a while.
export const maxDuration = 120;

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const memberId = params.get("memberId");
  const cycle = params.get("cycle");
  const status = params.get("status");
  const includeRemoved = params.get("all") === "1";

  let contributions = includeRemoved
    ? await listAllContributions()
    : await listContributions();
  if (memberId) {
    contributions = contributions.filter((c) => c.memberId === memberId);
  }
  if (cycle) {
    contributions = contributions.filter((c) => c.cycleKey === cycle);
  }
  if (status) {
    contributions = contributions.filter((c) => effectiveStatus(c) === status);
  }
  return NextResponse.json({ contributions });
}

interface SubmitBody {
  memberId?: string;
  title?: string;
  url?: string;
  /** The member's answer to "why do you think this is important?". */
  memberReason?: string;
  note?: string;
  focusArea?: string;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as SubmitBody;

  const memberId = (body.memberId ?? "").trim();
  const url = (body.url ?? "").trim();
  const memberReason = (body.memberReason ?? "").trim();
  const note = (body.note ?? "").trim();

  if (!memberId) {
    return NextResponse.json(
      { error: "اختر من أنت قبل الإرسال." },
      { status: 400 },
    );
  }
  if (!url) {
    return NextResponse.json(
      { error: "الرابط أو المصدر مطلوب." },
      { status: 400 },
    );
  }
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error("bad protocol");
  } catch {
    return NextResponse.json(
      { error: "هذا الرابط غير صالح. يجب أن يبدأ بـ https://" },
      { status: 400 },
    );
  }
  // Asked for up front rather than rejected after an evaluation: the member's
  // own reason is part of the contribution, not an optional extra.
  if (meaningfulWordCount(memberReason) < ACCEPTANCE.minReasonWords) {
    return NextResponse.json(
      { error: "اكتب الخبر بكلماتك، جملة أو جملتان تكفيان." },
      { status: 400 },
    );
  }

  const member = await getMember(memberId);
  if (!member) {
    return NextResponse.json(
      { error: "هذا العضو لم يعد موجودًا." },
      { status: 404 },
    );
  }

  const focusArea =
    (NEWSLETTER_CATEGORIES.find(
      (c) => c === (body.focusArea ?? "").trim(),
    ) as NewsletterCategory) ??
    member.focusArea ??
    null;

  const existing = await listContributions();

  const { contribution, notices } = await submitContribution(
    {
      member,
      url,
      title: (body.title ?? "").trim(),
      memberReason,
      note,
      focusArea,
    },
    existing,
  );

  return NextResponse.json({ contribution, notices }, { status: 201 });
}
