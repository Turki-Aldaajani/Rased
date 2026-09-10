"use client";

import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "./CurrentUser";

const NAV = [
  { href: "/dashboard", label: "الرئيسية" },
  { href: "/leaderboard", label: "المتصدرون" },
  { href: "/feed", label: "كل الاكتشافات" },
  { href: "/admin", label: "الإدارة" },
];

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
    return <span className="h-8 w-24 rounded-md bg-muted" />;
  }

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="text-foreground"
      >
        {member ? member.name : "من أنت؟"}
        <ChevronDown className="text-muted-foreground" />
      </Button>

      {open && (
        <div
          className="fade-in absolute end-0 z-30 mt-1 w-52 overflow-hidden rounded-lg border border-border bg-card p-1 shadow-[var(--shadow-card)]"
          role="listbox"
        >
          {members.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              لا يوجد أعضاء بعد. أضفهم من الإدارة.
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
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm transition-colors duration-200 hover:bg-muted",
                m.id === member?.id ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {m.name}
              {m.id === member?.id && (
                <Check className="ms-auto size-3.5 text-primary" />
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
              className="mt-1 w-full border-t border-border px-3 py-2 text-start text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground"
            >
              تسجيل الخروج
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const pathname = usePathname();
  // On the home page the composer is the interface — the header carries the
  // name and nothing else that could compete with it.
  const bare = pathname === "/";

  return (
    <header
      className={cn(
        "sticky top-0 z-20 bg-background",
        !bare && "border-b border-border",
      )}
    >
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4 sm:px-6">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-foreground"
        >
          AI Hunt
        </Link>

        {!bare && (
          <nav className="hidden items-center gap-5 md:flex">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "text-sm transition-colors duration-200",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="ms-auto flex items-center gap-1">
          <MemberPicker />
          {!bare && (
            <Button asChild size="sm" className="ms-1">
              <Link href="/">اكتشاف جديد</Link>
            </Button>
          )}
        </div>
      </div>

      {!bare && (
        <nav className="flex items-center gap-4 overflow-x-auto border-t border-border px-4 py-2 md:hidden">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "shrink-0 text-xs transition-colors duration-200",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
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
