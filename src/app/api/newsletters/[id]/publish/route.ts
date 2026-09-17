import { NextResponse } from "next/server";
import { adminRoute, readJson } from "@/lib/newsletter/http";
import { getIssueWithContext, publishIssue } from "@/lib/newsletter/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/** The only way anything becomes public — an editor's explicit approval. */
export async function POST(req: Request, { params }: Ctx) {
  return adminRoute(req, async () => {
    const { id } = await params;
    const body = await readJson(req);
    const { warnings } = await publishIssue(id, {
      acknowledgeWarnings: body.acknowledgeWarnings === true,
      republish: body.republish === true,
    });
    return NextResponse.json({
      ...(await getIssueWithContext(id)),
      publishWarnings: warnings,
    });
  });
}
