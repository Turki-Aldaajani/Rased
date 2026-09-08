"use client";

import Link from "next/link";
import type { Contribution } from "@/lib/db/schema";
import type { LeaderboardRow } from "@/lib/services/leaderboard";
import { useCurrentUser } from "./CurrentUser";
import { ContributionRow, rankBadge } from "./ui";

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
    return <div className="card h-40 animate-pulse" />;
  }

  if (!member) {
    return (
      <section className="card p-6">
        <h2 className="text-base font-bold text-ink">Pick your name to start</h2>
        <p className="mt-1 text-sm text-muted">
          No sign-up, no password — just tell us who you are and start hunting.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMemberId(m.id)}
              className="btn-secondary btn-sm"
            >
              {m.name}
            </button>
          ))}
          {members.length === 0 && (
            <p className="text-sm text-muted">
              No members yet —{" "}
              <Link href="/admin" className="link">
                add the team in Admin
              </Link>
              .
            </p>
          )}
        </div>
      </section>
    );
  }

  const week = weekly.find((r) => r.memberId === member.id);
  const month = monthly.find((r) => r.memberId === member.id);
  const total = totals[member.id] ?? { points: 0, count: 0 };
  const mine = latest[member.id] ?? [];

  const tiles = [
    { label: "Weekly points", value: week?.points ?? 0, sub: "best 3 finds count" },
    {
      label: "Weekly rank",
      value: week && week.points > 0 ? rankBadge(week.rank) : "—",
      sub: `of ${weekly.length} members`,
    },
    { label: "Monthly points", value: month?.points ?? 0, sub: "best 3 weeks" },
    { label: "Contributions", value: total.count, sub: `${total.points} pts all-time` },
  ];

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <span
          className="grid h-10 w-10 place-items-center rounded-full text-sm font-bold text-[var(--on-brand)]"
          style={{ background: "var(--brand)" }}
          aria-hidden
        >
          {member.name.charAt(0)}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">Hi {member.name}</p>
          <p className="text-xs text-muted">Your season so far</p>
        </div>
        <Link
          href={`/profile/${member.id}`}
          className="btn-secondary btn-sm ml-auto"
        >
          Full profile
        </Link>
      </div>

      <div className="grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
        {tiles.map((t) => (
          <div key={t.label} className="border-b border-line px-5 py-4 sm:border-b-0">
            <p className="section-title">{t.label}</p>
            <p className="mt-1.5 text-2xl font-bold text-ink">{t.value}</p>
            <p className="text-[11px] text-muted">{t.sub}</p>
          </div>
        ))}
      </div>

      <div className="px-2 py-2">
        {mine.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted">
            Nothing submitted yet.{" "}
            <Link href="/" className="link">
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
    </section>
  );
}
