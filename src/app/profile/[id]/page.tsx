import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContributionRow, ScoreRing } from "@/components/contribution";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SCORING } from "@/lib/config/scoring";
import { effectiveScore } from "@/lib/db/schema";
import { getMember, listContributions, listMembers } from "@/lib/db/store";
import { memberStats } from "@/lib/services/leaderboard";
import { weekKey } from "@/lib/util/date";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function ProfilePage({ params }: Props) {
  const { id } = await params;
  const member = await getMember(id);
  if (!member) notFound();

  const [members, contributions] = await Promise.all([
    listMembers(),
    listContributions(),
  ]);
  const stats = memberStats(member, members, contributions);
  const thisWeek = weekKey(new Date());

  const tiles = [
    { label: "Total points", value: stats.totalPoints, sub: "all time" },
    {
      label: "Weekly points",
      value: stats.weeklyPoints,
      sub: `best ${SCORING.bestContributionsPerWeek} finds`,
    },
    {
      label: "Monthly points",
      value: stats.monthlyPoints,
      sub: `best ${SCORING.bestWeeksPerMonth} weeks`,
    },
    {
      label: "Weekly rank",
      value: stats.weeklyPoints > 0 ? (stats.weeklyRank ?? "—") : "—",
      sub: `of ${members.length} members`,
    },
    {
      label: "Contributions",
      value: stats.contributionCount,
      sub: `${stats.weeklyCount} this week`,
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-3">
        <Link href="/leaderboard">
          <ArrowLeft />
          Leaderboard
        </Link>
      </Button>

      <Card className="flex flex-wrap items-center gap-4 p-5">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-foreground">
            {member.name}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {stats.contributionCount} contribution
            {stats.contributionCount === 1 ? "" : "s"} · {stats.totalPoints}{" "}
            points all time
          </p>
        </div>
        {stats.bestContribution && (
          <ScoreRing score={effectiveScore(stats.bestContribution)} size={56} />
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {tiles.map((t) => (
          <Card key={t.label} className="px-4 py-3">
            <p className="text-xs text-muted-foreground">{t.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
              {t.value}
            </p>
            <p className="text-xs text-muted-foreground">{t.sub}</p>
          </Card>
        ))}
      </div>

      {stats.bestContribution && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground">
            Best contribution
          </h2>
          <Link
            href={`/result/${stats.bestContribution.id}`}
            className="mt-3 flex items-start gap-3"
          >
            <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
              {effectiveScore(stats.bestContribution)}
            </span>
            <span className="min-w-0">
              <span className="block text-sm text-foreground">
                {stats.bestContribution.title}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {stats.bestContribution.type} ·{" "}
                {stats.bestContribution.evaluation.reason}
              </span>
            </span>
          </Link>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">History</h2>
          <p className="text-xs text-muted-foreground">
            Everything counts toward the record; only the best{" "}
            {SCORING.bestContributionsPerWeek} of each week count toward the
            ranking.
          </p>
        </div>
        <div className="p-2">
          {stats.history.length === 0 ? (
            <p className="px-3 py-6 text-sm text-muted-foreground">
              No contributions yet.
            </p>
          ) : (
            stats.history.map((c) => (
              <div key={c.id} className="relative">
                <ContributionRow contribution={c} showMember={false} />
                {c.weekKey === thisWeek && (
                  <span className="pointer-events-none absolute right-3 top-3.5 text-xs text-muted-foreground">
                    this week
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
