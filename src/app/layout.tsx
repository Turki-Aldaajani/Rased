import type { Metadata } from "next";
import Header from "@/components/Header";
import { CurrentUserProvider } from "@/components/CurrentUser";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Hunt",
  description:
    "Find something useful in AI, paste the link, and get it verified and scored.",
};

/**
 * Applies the saved theme before first paint so a dark-mode user never
 * sees a white flash.
 */
const THEME_SCRIPT = `
try {
  var t = localStorage.getItem("ai-hunt:theme");
  if (t === "light" || t === "dark") {
    document.documentElement.setAttribute("data-theme", t);
  }
} catch (e) {}
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        {/* Fallback for the brand font (Thmanyah) when it is not installed locally. */}
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen">
        <CurrentUserProvider>
          <Header />
          <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
            {children}
          </main>
          <footer className="mx-auto max-w-5xl px-4 pb-10 text-center text-xs text-muted-foreground sm:px-6">
            Scores are AI-assisted and can be corrected by the host.
          </footer>
        </CurrentUserProvider>
      </body>
    </html>
  );
}
