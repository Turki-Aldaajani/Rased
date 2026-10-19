import { NextResponse } from "next/server";
import { NewsletterError } from "@/lib/newsletter/errors";

/**
 * Reviewer endpoints: the token in the path is the only credential, and the
 * admin passcode is neither needed nor accepted. Nothing they return is
 * cached or indexed.
 */
export const PRIVATE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  // The token is in the path; a link out of the preview must not carry it.
  "Referrer-Policy": "no-referrer",
} as const;

function withPrivateHeaders(res: Response): Response {
  for (const [k, v] of Object.entries(PRIVATE_HEADERS)) res.headers.set(k, v);
  return res;
}

export async function reviewRoute(handler: () => Promise<Response>): Promise<Response> {
  try {
    return withPrivateHeaders(await handler());
  } catch (err) {
    if (err instanceof NewsletterError) {
      return withPrivateHeaders(
        NextResponse.json({ error: err.message, ...err.details }, { status: err.status }),
      );
    }
    return withPrivateHeaders(
      NextResponse.json(
        { error: `خطأ غير متوقع: ${(err as Error)?.message ?? "غير معروف"}` },
        { status: 500 },
      ),
    );
  }
}
