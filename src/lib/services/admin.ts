import { NextResponse } from "next/server";

/** Header the admin page sends with every privileged request. */
export const ADMIN_HEADER = "x-admin-passcode";

export function adminPasscode(): string {
  return process.env.ADMIN_PASSCODE || "rased";
}

export function isAdmin(req: Request): boolean {
  return req.headers.get(ADMIN_HEADER) === adminPasscode();
}

/**
 * Returns a 401 response when the caller is not the admin, or null when the
 * request may proceed. Deliberately a shared passcode — this is an internal
 * MVP, not an auth system.
 */
export function requireAdmin(req: Request): NextResponse | null {
  if (isAdmin(req)) return null;
  return NextResponse.json(
    { error: "Admin passcode required." },
    { status: 401 },
  );
}
