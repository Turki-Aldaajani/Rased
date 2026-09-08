import Link from "next/link";
import { notFound } from "next/navigation";
import { ContributionRow, ScoreRing, rankBadge } from "@/components/ui";
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
      value: stats.weeklyPoints > 0 ? rankBadge(stats.weeklyRank ?? 0) : "—",
      sub: `of ${members.length} members`,
    },
    {
      label: "Contributions",
      value: stats.contributionCount,
      sub: `${stats.weeklyCount} this week`,
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/leaderboard" className="btn-ghost btn-sm">
        ← Leaderboard
      </Link>

      <section className="card flex flex-wrap items-center gap-4 p-6">
        <span
          className="grid h-14 w-14 place-items-center rounded-full text-xl font-bold text-[var(--on-brand)]"
          style={{ background: "var(--brand)" }}
          aria-hidden
        >
          {member.name.charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-ink">{member.name}</h1>
          <p className="text-sm text-muted">
            {stats.contributionCount} contribution
            {stats.contributionCount === 1 ? "" : "s"} ·{" "}
            {stats.totalPoints} points all time
          </p>
        </div>
        {stats.bestContribution && (
          <ScoreRing score={effectiveScore(stats.bestContribution)} size={64} />
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className="card px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
              {t.label}
            </p>
            <p className="mt-1 text-xl font-bold text-ink">{t.value}</p>
            <p className="text-[11px] text-muted">{t.sub}</p>
          </div>
        ))}
      </div>

      {stats.bestContribution && (
        <section className="card p-6">
          <h2 className="section-title">Best contribution</h2>
          <Link
            href={`/result/${stats.bestContribution.id}`}
            className="mt-3 flex items-start gap-3"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-soft text-base font-bold text-brand-ink">
              {effectiveScore(stats.bestContribution)}
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-ink">
                {stats.bestContribution.title}
              </span>
              <span className="mt-0.5 block text-sm text-muted">
                {stats.bestContribution.type} ·{" "}
                {stats.bestContribution.evaluation.reason}
              </span>
            </span>
          </Link>
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-sm font-bold text-ink">Contribution history</h2>
          <p className="text-xs text-muted">
            Everything counts toward the record; only the best{" "}
            {SCORING.bestContributionsPerWeek} of each week count toward the
            ranking.
          </p>
        </div>
        <div className="p-2">
          {stats.history.length === 0 ? (
            <p className="px-3 py-6 text-sm text-muted">
              No contributions yet.
            </p>
          ) : (
            stats.history.map((c) => (
              <div key={c.id} className="relative">
                <ContributionRow contribution={c} showMember={false} />
                {c.weekKey === thisWeek && (
                  <span className="pointer-events-none absolute right-3 top-3 text-[10px] font-bold uppercase tracking-wider text-accent-ink">
                    this week
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
