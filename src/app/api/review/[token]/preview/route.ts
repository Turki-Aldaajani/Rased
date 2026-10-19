import { reviewRoute } from "@/lib/review/http";
import { reviewerPreview } from "@/lib/review/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/** The whole draft as it will be published, with the draft ribbon. Read-only. */
export async function GET(_req: Request, { params }: Ctx) {
  return reviewRoute(async () => {
    const { token } = await params;
    return new Response(await reviewerPreview(token), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  });
}
