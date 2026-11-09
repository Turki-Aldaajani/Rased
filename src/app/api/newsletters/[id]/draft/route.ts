import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/newsletter/http";
import { getIssueWithContext, returnToDraft } from "@/lib/newsletter/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Takes a published issue back to a draft. Nothing public changes. */
export async function POST(req: Request, { params }: Ctx) {
  return adminRoute(req, async () => {
    const { id } = await params;
    await returnToDraft(id);
    return NextResponse.json(await getIssueWithContext(id));
  });
}
