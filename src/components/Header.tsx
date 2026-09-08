"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCurrentUser } from "./CurrentUser";

const NAV = [
  { href: "/", label: "New find" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/feed", label: "All finds" },
  { href: "/admin", label: "Admin" },
];

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const stored = (() => {
      try {
        return localStorage.getItem("ai-hunt:theme");
      } catch {
        return null;
      }
    })();
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
      document.documentElement.setAttribute("data-theme", stored);
    }
  }, []);

  const toggle = () => {
    const current =
      theme ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light");
    const next = current === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("ai-hunt:theme", next);
    } catch {
      /* ignore */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn-ghost btn-sm"
      aria-label="Toggle light and dark mode"
      title="Toggle light / dark"
    >
      <span aria-hidden>{theme === "dark" ? "☀" : "☾"}</span>
    </button>
  );
}

function MemberPicker() {
  const { members, member, setMemberId, ready } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!ready) {
    return <span className="h-9 w-28 animate-pulse rounded-lg bg-line" />;
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-secondary btn-sm"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {member ? (
          <>
            <span
              className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold text-[var(--on-brand)]"
              style={{ background: "var(--brand)" }}
              aria-hidden
            >
              {member.name.charAt(0)}
            </span>
            {member.name}
          </>
        ) : (
          "Who are you?"
        )}
        <span aria-hidden className="text-muted">
          ▾
        </span>
      </button>

      {open && (
        <div
          className="card absolute right-0 z-30 mt-2 w-56 overflow-hidden p-1"
          role="listbox"
        >
          {members.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted">
              No team members yet. Add them in Admin.
            </p>
          )}
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected={m.id === member?.id}
              onClick={() => {
                setMemberId(m.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-brand-soft ${
                m.id === member?.id
                  ? "font-semibold text-brand-ink"
                  : "text-ink"
              }`}
            >
              <span
                className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold"
                style={{
                  background: "var(--brand-soft)",
                  color: "var(--brand-ink)",
                }}
                aria-hidden
              >
                {m.name.charAt(0)}
              </span>
              {m.name}
              {m.id === member?.id && (
                <span className="ml-auto text-xs" aria-hidden>
                  ✓
                </span>
              )}
            </button>
          ))}
          {member && (
            <button
              type="button"
              onClick={() => {
                setMemberId(null);
                setOpen(false);
              }}
              className="mt-1 w-full border-t border-line px-3 py-2 text-left text-xs text-muted hover:text-ink"
            >
              Switch off
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const pathname = usePathname();
  // On the home page the composer is the interface. The header shrinks to the
  // logo and "who am I", so nothing competes with the one action.
  const bare = pathname === "/";

  return (
    <header
      className={`sticky top-0 z-20 ${
        bare
          ? ""
          : "border-b border-line bg-[color-mix(in_srgb,var(--bg)_86%,transparent)] backdrop-blur"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <span
            className="icon-tile h-9 w-9 text-base transition-transform duration-200 group-hover:scale-105"
            aria-hidden
          >
            🎯
          </span>
          <span className={bare ? "hidden" : "hidden sm:block"}>
            <span className="block text-sm font-bold leading-tight text-ink">
              AI Hunt
            </span>
            <span className="block text-[11px] leading-tight text-muted">
              Team knowledge game
            </span>
          </span>
        </Link>

        {!bare && (
          <nav className="ml-2 hidden items-center gap-0.5 md:flex">
            {NAV.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-brand-soft text-brand-ink"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <MemberPicker />
          {!bare && (
            <Link href="/" className="btn-primary btn-sm">
              <span aria-hidden>+</span>
              <span className="hidden sm:inline">Add contribution</span>
              <span className="sm:hidden">Add</span>
            </Link>
          )}
        </div>
      </div>

      {!bare && (
        <nav className="flex items-center gap-1 overflow-x-auto border-t border-line px-4 py-2 md:hidden">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
                  active ? "bg-brand-soft text-brand-ink" : "text-muted"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
