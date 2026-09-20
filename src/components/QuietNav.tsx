"use client";

import { LayoutDashboard, List, Settings, Trophy, User } from "lucide-react";
import Link from "next/link";
import { useCurrentUser } from "./CurrentUser";

/**
 * Everything here is somewhere you go *after* submitting, not before — so it
 * sits below the grid, in the quietest type on the page. The cycle's numbers
 * are not repeated here; the tiles beside the composer already carry them.
 */
export default function QuietNav() {
  const { member } = useCurrentUser();

  const items = [
    { href: "/dashboard", label: "الرئيسية", Icon: LayoutDashboard },
    { href: "/leaderboard", label: "المتصدرون", Icon: Trophy },
    { href: "/feed", label: "كل المساهمات", Icon: List },
    member
      ? { href: `/profile/${member.id}`, label: "مساهماتك", Icon: User }
      : { href: "/admin", label: "الإدارة", Icon: Settings },
  ];

  return (
    <div className="mx-auto w-full max-w-xl">
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
    </div>
  );
}
