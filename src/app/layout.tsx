import type { Metadata } from "next";
import Header from "@/components/Header";
import { CurrentUserProvider } from "@/components/CurrentUser";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Hunt",
  description:
    "Find something useful in AI, paste the link, and get it verified and scored.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
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
