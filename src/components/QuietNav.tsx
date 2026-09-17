"use client";

import { LayoutDashboard, List, Settings, Trophy, User } from "lucide-react";
import Link from "next/link";
import { contributionsCount, daysCount } from "@/lib/util/ar";
import { daysLeftInCycle } from "@/lib/util/date";
import { useCurrentUser } from "./CurrentUser";

/**
 * The only thing on the home page besides the composer, and it sits well below
 * it: everything here is somewhere you go *after* submitting, not before.
 */
export default function QuietNav({ thisCycle }: { thisCycle: number }) {
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
        {thisCycle === 0
          ? `لا توجد مساهمات في هذه الدورة بعد · بقي ${daysCount(daysLeftInCycle())}`
          : `${contributionsCount(thisCycle)} في هذه الدورة · بقي ${daysCount(daysLeftInCycle())}`}
      </p>
    </div>
  );
}
