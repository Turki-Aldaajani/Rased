import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "مراجعة المسودة",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

export default function ReviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
