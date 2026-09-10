import type { Metadata } from "next";
import Header from "@/components/Header";
import { CurrentUserProvider } from "@/components/CurrentUser";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Hunt",
  description:
    "الصق رابطًا لشيء مفيد في الذكاء الاصطناعي، ويُتحقق منه ويُقيّم تلقائيًا.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen">
        <CurrentUserProvider>
          <Header />
          <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
            {children}
          </main>
          <footer className="mx-auto max-w-5xl px-4 pb-10 text-center text-xs text-muted-foreground sm:px-6">
            التقييمات بمساعدة الذكاء الاصطناعي، ويمكن للمشرف تعديلها.
          </footer>
        </CurrentUserProvider>
      </body>
    </html>
  );
}
