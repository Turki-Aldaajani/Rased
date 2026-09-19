import { NextResponse } from "next/server";
import { adminRoute, readJson } from "@/lib/newsletter/http";
import {
  getIssueWithContext,
  removeDraft,
  saveIssue,
  type IssueEdit,
} from "@/lib/newsletter/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  return adminRoute(req, async () => {
    const { id } = await params;
    return NextResponse.json(await getIssueWithContext(id));
  });
}

/** Saves the editor's version of the draft. */
export async function PUT(req: Request, { params }: Ctx) {
  return adminRoute(req, async () => {
    const { id } = await params;
    const body = (await readJson(req)) as IssueEdit;
    await saveIssue(id, body);
    return NextResponse.json(await getIssueWithContext(id));
  });
}

/** Deletes a draft. A published issue cannot be deleted. */
export async function DELETE(req: Request, { params }: Ctx) {
  return adminRoute(req, async () => {
    const { id } = await params;
    await removeDraft(id);
    return NextResponse.json({ ok: true });
  });
}
