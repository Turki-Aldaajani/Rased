import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/services/admin";
import { PublishConfigError } from "./publish";
import { NewsletterError } from "./service";

/**
 * Every newsletter endpoint is for editors only, and every failure comes back
 * as a clear JSON error, nothing is half-written on the way out.
 */
export async function adminRoute(
  req: Request,
  handler: () => Promise<Response>,
): Promise<Response> {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    return await handler();
  } catch (err) {
    if (err instanceof NewsletterError) {
      return NextResponse.json(
        { error: err.message, ...err.details },
        { status: err.status },
      );
    }
    if (err instanceof PublishConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: `خطأ غير متوقع: ${(err as Error)?.message ?? "غير معروف"}` },
      { status: 500 },
    );
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  return (await req.json().catch(() => ({}))) as Record<string, unknown>;
}
