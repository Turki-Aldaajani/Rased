"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Contribution } from "@/lib/db/schema";
import type { LeaderboardRow } from "@/lib/services/leaderboard";
import { ContributionRow } from "./contribution";
import { useCurrentUser } from "./CurrentUser";

export interface YourStatsProps {
  weekly: LeaderboardRow[];
  monthly: LeaderboardRow[];
  totals: Record<string, { points: number; count: number }>;
  latest: Record<string, Contribution[]>;
}

export default function YourStats({
  weekly,
  monthly,
  totals,
  latest,
}: YourStatsProps) {
  const { member, ready, members, setMemberId } = useCurrentUser();

  if (!ready) {
    return <Card className="h-36" />;
  }

  if (!member) {
    return (
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-foreground">
          Pick your name to see your stats
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          No sign-up, no password.
        </p>
        <div className="mt-3 flex flex-wrap gap-1">
          {members.map((m) => (
            <Button
              key={m.id}
              variant="ghost"
              size="sm"
              onClick={() => setMemberId(m.id)}
            >
              {m.name}
            </Button>
          ))}
          {members.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No members yet —{" "}
              <Link href="/admin" className="text-primary underline-offset-4 hover:underline">
                add the team in Admin
              </Link>
              .
            </p>
          )}
        </div>
      </Card>
    );
  }

  const week = weekly.find((r) => r.memberId === member.id);
  const month = monthly.find((r) => r.memberId === member.id);
  const total = totals[member.id] ?? { points: 0, count: 0 };
  const mine = latest[member.id] ?? [];

  const tiles = [
    { label: "Weekly points", value: week?.points ?? 0, sub: "best 3 finds" },
    {
      label: "Weekly rank",
      value: week && week.points > 0 ? week.rank : "—",
      sub: `of ${weekly.length} members`,
    },
    { label: "Monthly points", value: month?.points ?? 0, sub: "best 3 weeks" },
    {
      label: "Contributions",
      value: total.count,
      sub: `${total.points} pts all-time`,
    },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {member.name}
          </p>
          <p className="text-xs text-muted-foreground">Your season so far</p>
        </div>
        <Button asChild variant="outline" size="sm" className="ml-auto">
          <Link href={`/profile/${member.id}`}>Full profile</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 divide-border sm:grid-cols-4 sm:divide-x">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="border-b border-border px-5 py-4 sm:border-b-0"
          >
            <p className="text-xs text-muted-foreground">{t.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {t.value}
            </p>
            <p className="text-xs text-muted-foreground">{t.sub}</p>
          </div>
        ))}
      </div>

      <div className="p-2">
        {mine.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            Nothing submitted yet.{" "}
            <Link
              href="/"
              className="text-primary underline-offset-4 hover:underline"
            >
              Add your first find
            </Link>
            .
          </p>
        ) : (
          mine
            .slice(0, 3)
            .map((c) => (
              <ContributionRow key={c.id} contribution={c} showMember={false} />
            ))
        )}
      </div>
    </Card>
  );
}
