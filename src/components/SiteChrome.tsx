"use client";

import { usePathname } from "next/navigation";

/**
 * The site's header and footer, left out of a reviewer's page: a reviewer
 * gets the draft and nothing that leads elsewhere in the app.
 */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/review/")) return null;
  return <>{children}</>;
}
