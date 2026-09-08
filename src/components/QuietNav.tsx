"use client";

import { LayoutDashboard, List, Settings, Trophy, User } from "lucide-react";
import Link from "next/link";
import { useCurrentUser } from "./CurrentUser";

/**
 * The only thing on the home page besides the composer, and it sits well below
 * it: everything here is somewhere you go *after* submitting, not before.
 */
export default function QuietNav({ thisWeek }: { thisWeek: number }) {
  const { member } = useCurrentUser();

  const items = [
    { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
    { href: "/leaderboard", label: "Leaderboard", Icon: Trophy },
    { href: "/feed", label: "All finds", Icon: List },
    member
      ? { href: `/profile/${member.id}`, label: "Your finds", Icon: User }
      : { href: "/admin", label: "Admin", Icon: Settings },
  ];

  return (
    <div className="mx-auto mt-24 w-full max-w-xl">
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        {items.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground"
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </Link>
        ))}
      </div>

      <p className="mt-5 text-center text-xs text-muted-foreground">
        {thisWeek === 0
          ? "No finds yet this week."
          : `${thisWeek} find${thisWeek === 1 ? "" : "s"} this week.`}
      </p>
    </div>
  );
}
