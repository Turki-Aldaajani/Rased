import { NextResponse } from "next/server";
import { adminPasscode } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { passcode?: string };
  if ((body.passcode ?? "") === adminPasscode()) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Wrong passcode." }, { status: 401 });
}
