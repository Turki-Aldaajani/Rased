import { NextResponse } from "next/server";
import { removeMember, updateMember } from "@/lib/db/store";
import { requireAdmin } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    active?: boolean;
  };
  const member = await updateMember(id, body);
  if (!member) {
    return NextResponse.json({ error: "العضو غير موجود." }, { status: 404 });
  }
  return NextResponse.json({ member });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { id } = await params;
  const ok = await removeMember(id);
  if (!ok) {
    return NextResponse.json({ error: "العضو غير موجود." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
