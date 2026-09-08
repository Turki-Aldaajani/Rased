import Link from "next/link";
import YourStats from "@/components/YourStats";
import { ContributionRow, rankBadge } from "@/components/ui";
import { effectiveScore, type Contribution } from "@/lib/db/schema";
import { listContributions, listMembers } from "@/lib/db/store";
import { teamSummary, type LeaderboardRow } from "@/lib/services/leaderboard";
import { monthLabel, weekLabel } from "@/lib/util/date";

export const dynamic = "force-dynamic";

function ChampionCard({
  eyebrow,
  period,
  row,
  emptyText,
  tone,
}: {
  eyebrow: string;
  period: string;
  row: LeaderboardRow | null;
  emptyText: string;
  tone: "brand" | "accent";
}) {
  const bg =
    tone === "brand" ? "var(--grad-brand)" : "var(--grad-violet)";

  if (!row) {
    return (
      <div className="card flex flex-col justify-center p-6">
        <p className="section-title">{eyebrow}</p>
        <p className="mt-2 text-sm text-muted">{emptyText}</p>
      </div>
    );
  }

  return (
    <div
      className="card-hover relative overflow-hidden rounded-2xl p-6 text-[var(--on-brand)]"
      style={{ background: bg }}
    >
      <span
        className="pointer-events-none absolute -right-6 -top-8 text-[7rem] opacity-15"
        aria-hidden
      >
        🏆
      </span>
      <p className="text-xs font-bold uppercase tracking-[0.14em] opacity-75">
        {eyebrow}
      </p>
      <p className="mt-3 flex items-center gap-2 text-2xl font-bold">
        <span aria-hidden>🥇</span>
        {row.memberName}
      </p>
      <p className="mt-1 text-sm opacity-80">
        {row.points} points · {row.contributions} contribution
        {row.contributions === 1 ? "" : "s"} · {period}
      </p>
      {row.bestContribution && (
        <Link
          href={`/result/${row.bestContribution.id}`}
          className="mt-4 flex items-start gap-3 rounded-lg bg-white/12 p-3 transition-colors hover:bg-white/20"
        >
          <span className="rounded-md bg-white/20 px-2 py-1 text-xs font-bold">
            {effectiveScore(row.bestContribution)}
          </span>
          <span className="min-w-0">
            <span className="block text-xs uppercase tracking-wider opacity-70">
              Best find
            </span>
            <span className="block truncate text-sm font-semibold">
              {row.bestContribution.title}
            </span>
          </span>
        </Link>
      )}
    </div>
  );
}

function LeaderboardList({ rows }: { rows: LeaderboardRow[] }) {
  const scored = rows.filter((r) => r.points > 0);
  if (scored.length === 0) {
    return (
      <p className="px-5 py-6 text-sm text-muted">
        No points yet this week. The board is wide open.
      </p>
    );
  }
  return (
    <ol className="divide-y divide-line">
      {scored.map((row) => (
        <li key={row.memberId}>
          <Link
            href={`/profile/${row.memberId}`}
            className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-brand-soft"
          >
            <span className="w-7 shrink-0 text-center text-sm font-bold text-muted">
              {rankBadge(row.rank)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">
                {row.memberName}
              </span>
              <span className="block text-xs text-muted">
                {row.counted} of {row.contributions} find
                {row.contributions === 1 ? "" : "s"} counted
              </span>
            </span>
            <span className="text-base font-bold text-brand-ink">
              {row.points}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export default async function DashboardPage() {
  const [members, contributions] = await Promise.all([
    listMembers(),
    listContributions(),
  ]);
  const summary = teamSummary(members, contributions);

  // Small per-member rollups so the client card does no maths of its own.
  const totals: Record<string, { points: number; count: number }> = {};
  const latest: Record<string, Contribution[]> = {};
  for (const m of members) {
    const mine = contributions.filter((c) => c.memberId === m.id);
    totals[m.id] = {
      points: mine.reduce((s, c) => s + effectiveScore(c), 0),
      count: mine.length,
    };
    latest[m.id] = mine.slice(0, 3);
  }

  const top = summary.weekly.filter((r) => r.points > 0)[0] ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">This week in AI Hunt</h1>
        <p className="mt-1 text-sm text-muted">
          {weekLabel(summary.week)} · {summary.totals.thisWeek} find
          {summary.totals.thisWeek === 1 ? "" : "s"} submitted so far
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChampionCard
          eyebrow="Contributor of the week"
          period={weekLabel(summary.week)}
          row={top}
          emptyText="Nobody has scored yet this week — be the first."
          tone="brand"
        />
        <ChampionCard
          eyebrow="Monthly champion"
          period={monthLabel(summary.month)}
          row={summary.monthlyChampion}
          emptyText="The monthly race starts with the first scored find."
          tone="accent"
        />
      </div>

      <YourStats
        weekly={summary.weekly}
        monthly={summary.monthly}
        totals={totals}
        latest={latest}
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="card overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="text-sm font-bold text-ink">Weekly leaderboard</h2>
              <p className="text-xs text-muted">Best 3 finds per person count</p>
            </div>
            <Link href="/leaderboard" className="btn-ghost btn-sm">
              All →
            </Link>
          </div>
          <LeaderboardList rows={summary.weekly} />
        </section>

        <section className="card overflow-hidden lg:col-span-3">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="text-sm font-bold text-ink">Recent finds</h2>
              <p className="text-xs text-muted">
                {summary.totals.contributions} total ·{" "}
                {summary.totals.originals} original ·{" "}
                {summary.totals.duplicates} duplicate
              </p>
            </div>
            <Link href="/feed" className="btn-ghost btn-sm">
              All →
            </Link>
          </div>
          <div className="p-2">
            {summary.recent.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <p className="text-sm font-semibold text-ink">
                  No contributions yet
                </p>
                <p className="mt-1 text-sm text-muted">
                  Found something interesting in AI this week?
                </p>
                <Link href="/" className="btn-primary btn-sm mt-4">
                  Add the first one
                </Link>
              </div>
            ) : (
              summary.recent.map((c) => (
                <ContributionRow key={c.id} contribution={c} />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
