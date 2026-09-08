import Link from "next/link";
import { Card } from "@/components/ui/card";
import { SCORING } from "@/lib/config/scoring";
import { effectiveScore } from "@/lib/db/schema";
import { listContributions, listMembers } from "@/lib/db/store";
import {
  monthlyLeaderboard,
  weeklyLeaderboard,
  type LeaderboardRow,
} from "@/lib/services/leaderboard";
import { monthKey, monthLabel, weekKey, weekLabel } from "@/lib/util/date";

export const dynamic = "force-dynamic";

function Board({
  title,
  subtitle,
  rows,
  emptyText,
}: {
  title: string;
  subtitle: string;
  rows: LeaderboardRow[];
  emptyText: string;
}) {
  const scored = rows.filter((r) => r.points > 0);
  const unscored = rows.filter((r) => r.points === 0);

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>

      {scored.length === 0 ? (
        <p className="px-5 py-8 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ol className="divide-y divide-border">
          {scored.map((row) => (
            <li key={row.memberId}>
              <Link
                href={`/profile/${row.memberId}`}
                className="flex items-center gap-4 px-5 py-4 transition-colors duration-200 hover:bg-muted"
              >
                <span className="w-4 shrink-0 text-sm tabular-nums text-muted-foreground">
                  {row.rank}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">
                    {row.memberName}
                  </span>
                  {row.bestContribution && (
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      Best: {row.bestContribution.title} (
                      {effectiveScore(row.bestContribution)} pts)
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-base font-semibold tabular-nums text-foreground">
                    {row.points}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {row.counted}/{row.contributions} counted
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      {unscored.length > 0 && (
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          No points yet: {unscored.map((r) => r.memberName).join(", ")}
        </p>
      )}
    </Card>
  );
}

export default async function LeaderboardPage() {
  const [members, contributions] = await Promise.all([
    listMembers(),
    listContributions(),
  ]);
  const now = new Date();
  const week = weekKey(now);
  const month = monthKey(now);

  const weekly = weeklyLeaderboard(members, contributions, week);
  const monthly = monthlyLeaderboard(members, contributions, month);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Leaderboard
        </h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Only your best {SCORING.bestContributionsPerWeek} finds count each
          week, and your best {SCORING.bestWeeksPerMonth} weeks count each month.
          Quality beats volume.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Board
          title="Weekly"
          subtitle={`${weekLabel(week)} · best ${SCORING.bestContributionsPerWeek} finds per person`}
          rows={weekly}
          emptyText="Nobody has scored this week yet."
        />
        <Board
          title="Monthly"
          subtitle={`${monthLabel(month)} · best ${SCORING.bestWeeksPerMonth} weeks per person`}
          rows={monthly}
          emptyText="No points recorded this month yet."
        />
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-foreground">
          How points work
        </h2>
        <ul className="mt-4 grid gap-2.5 text-sm text-muted-foreground sm:grid-cols-2">
          <li>
            <span className="text-foreground">Importance</span> — how much it
            matters to an AI team (max {SCORING.maxPoints.importance}).
          </li>
          <li>
            <span className="text-foreground">Recency</span> — from the original
            publication date, not your discovery date (max{" "}
            {SCORING.maxPoints.recency}).
          </li>
          <li>
            <span className="text-foreground">Usefulness</span> — practical
            value for projects and study (max {SCORING.maxPoints.usefulness}).
          </li>
          <li>
            <span className="text-foreground">Relevance</span> — fit with the
            category and our AI focus (max {SCORING.maxPoints.relevance}).
          </li>
          <li>
            <span className="text-foreground">Source reliability</span> —
            official sources score highest (max{" "}
            {SCORING.maxPoints.sourceReliability}).
          </li>
          <li>
            <span className="text-foreground">Personal contribution</span> —
            your own insight in “Why is this useful?” (max{" "}
            {SCORING.maxPoints.personalContribution}).
          </li>
        </ul>
        <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
          A duplicate keeps{" "}
          {Math.round(SCORING.duplicateMultiplier.duplicate * 100)}% of its
          points, a partial duplicate{" "}
          {Math.round(SCORING.duplicateMultiplier.partial * 100)}%. An
          unverifiable source keeps{" "}
          {Math.round(SCORING.verificationMultiplier.unverified * 100)}%.
        </p>
      </Card>
    </div>
  );
}
