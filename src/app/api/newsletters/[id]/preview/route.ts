import { adminRoute } from "@/lib/newsletter/http";
import { previewHtml } from "@/lib/newsletter/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** The draft rendered exactly as it would be published, plus a "draft" ribbon. */
export async function GET(req: Request, { params }: Ctx) {
  return adminRoute(req, async () => {
    const { id } = await params;
    const html = await previewHtml(id);
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  });
}
