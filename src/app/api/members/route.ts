import { NextResponse } from "next/server";
import { addMember, listAllMembers, listMembers } from "@/lib/db/store";
import { requireAdmin } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const all = new URL(req.url).searchParams.get("all") === "1";
  const members = all ? await listAllMembers() : await listMembers();
  return NextResponse.json({ members });
}

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "A name is required." }, { status: 400 });
  }
  if (name.length > 40) {
    return NextResponse.json(
      { error: "That name is too long." },
      { status: 400 },
    );
  }
  const member = await addMember(name);
  return NextResponse.json({ member }, { status: 201 });
}
