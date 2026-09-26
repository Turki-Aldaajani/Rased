import { NextResponse } from "next/server";
import {
  NEWSLETTER_CATEGORIES,
  type NewsletterCategory,
} from "@/lib/db/schema";
import { removeMember, updateMember } from "@/lib/db/store";
import { isAdmin, requireAdmin } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Admin edits the roster; a member may set their own research direction,
 * which is a preference, not a permission.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    active?: boolean;
    focusArea?: string | null;
    showNameOnDiscoveries?: boolean;
  };

  const focusOnly =
    body.name === undefined && body.active === undefined;
  if (!focusOnly) {
    const denied = requireAdmin(req);
    if (denied) return denied;
  }

  const focusArea =
    body.focusArea === undefined
      ? undefined
      : ((NEWSLETTER_CATEGORIES.find(
          (c) => c === String(body.focusArea ?? "").trim(),
        ) as NewsletterCategory) ?? null);

  const member = await updateMember(id, {
    ...(isAdmin(req) ? { name: body.name, active: body.active } : {}),
    ...(focusArea === undefined ? {} : { focusArea }),
    ...(body.showNameOnDiscoveries === undefined
      ? {}
      : { showNameOnDiscoveries: body.showNameOnDiscoveries }),
  });
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
