import type { Metadata } from "next";
import Header from "@/components/Header";
import { CurrentUserProvider } from "@/components/CurrentUser";
import { DiamondRule } from "@/components/brand/DiamondRule";
import { INJAZ_TAGLINE, InjazMark } from "@/components/brand/InjazLogo";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rased",
  description:
    "الصق رابطًا لشيء مفيد في الذكاء الاصطناعي، ويُتحقق منه ويُقيّم تلقائيًا.",
};

/**
 * Motion is opt-in, and it is decided before the first paint: the reveal
 * classes do nothing until this puts `reveal-ready` on <html>, so a reader
 * without JavaScript, or one who asked for less motion, gets the page whole
 * and still.
 */
const MOTION_GATE = `(function(r){if('IntersectionObserver' in window&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){r.classList.add('reveal-ready')}})(document.documentElement)`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <script dangerouslySetInnerHTML={{ __html: MOTION_GATE }} />
      </head>
      <body className="min-h-screen">
        <div className="ambient" aria-hidden />
        <CurrentUserProvider>
          <Header />
          <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
            {children}
          </main>
          <footer className="mx-auto max-w-5xl px-4 pb-12 sm:px-6">
            <DiamondRule className="mb-6" />
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex items-center gap-2 text-muted-foreground">
                <InjazMark className="h-5" />
                <span className="font-serif-display text-sm text-foreground">
                  إنـجـاز
                </span>
              </div>
              <p
                className="font-serif-display text-sm"
                style={{ color: "var(--gold-bright)" }}
              >
                {INJAZ_TAGLINE}
              </p>
              <p className="text-xs text-muted-foreground">
                التقييمات بمساعدة الذكاء الاصطناعي، ويمكن للمشرف تعديلها.
              </p>
            </div>
          </footer>
        </CurrentUserProvider>
      </body>
    </html>
  );
}
