"use client";

import Link from "next/link";
import { useCurrentUser } from "./CurrentUser";

interface Item {
  href: string;
  label: string;
  sub: string;
  icon: string;
  grad: string;
}

/**
 * The only thing on the home page besides the composer. It sits well below the
 * fold: everything here is a place you go *after* submitting, not before.
 */
export default function QuietNav({ thisWeek }: { thisWeek: number }) {
  const { member } = useCurrentUser();

  const items: Item[] = [
    {
      href: "/dashboard",
      label: "Dashboard",
      sub: "This week at a glance",
      icon: "📊",
      grad: "var(--grad-violet)",
    },
    {
      href: "/leaderboard",
      label: "Leaderboard",
      sub: "Weekly + monthly",
      icon: "🏆",
      grad: "var(--grad-amber)",
    },
    {
      href: "/feed",
      label: "All finds",
      sub: "What the team shared",
      icon: "🗂️",
      grad: "var(--grad-blue)",
    },
    member
      ? {
          href: `/profile/${member.id}`,
          label: "Your finds",
          sub: `${member.name} · history and points`,
          icon: "👤",
          grad: "var(--grad-mint)",
        }
      : {
          href: "/admin",
          label: "Host area",
          sub: "Team and overrides",
          icon: "⚙️",
          grad: "var(--grad-mint)",
        },
  ];

  return (
    <div className="mx-auto mt-20 w-full max-w-2xl">
      <p className="text-center text-xs text-muted">
        {thisWeek === 0
          ? "No finds yet this week — the board is wide open."
          : `${thisWeek} find${thisWeek === 1 ? "" : "s"} submitted by the team this week.`}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="card card-hover flex items-center gap-3 p-3.5"
          >
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm text-[var(--on-brand)]"
              style={{ background: item.grad }}
              aria-hidden
            >
              {item.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">
                {item.label}
              </span>
              <span className="block truncate text-xs text-muted">
                {item.sub}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
