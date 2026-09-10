import Link from "next/link";
import YourStats from "@/components/YourStats";
import { ContributionRow } from "@/components/contribution";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { effectiveScore, type Contribution } from "@/lib/db/schema";
import { listContributions, listMembers } from "@/lib/db/store";
import { teamSummary, type LeaderboardRow } from "@/lib/services/leaderboard";
import { findsCount, pointsCount } from "@/lib/util/ar";
import { monthLabel, weekLabel } from "@/lib/util/date";

export const dynamic = "force-dynamic";

function LeaderCard({
  label,
  period,
  row,
  emptyText,
}: {
  label: string;
  period: string;
  row: LeaderboardRow | null;
  emptyText: string;
}) {
  return (
    <Card className="p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      {row ? (
        <>
          <p className="mt-2 text-lg font-semibold text-foreground">
            {row.memberName}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {pointsCount(row.points)} · {findsCount(row.contributions)} ·{" "}
            {period}
          </p>
          {row.bestContribution && (
            <Link
              href={`/result/${row.bestContribution.id}`}
              className="mt-4 flex items-start gap-3 border-t border-border pt-3 transition-colors duration-200 hover:text-foreground"
            >
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {effectiveScore(row.bestContribution)}
              </span>
              <span className="min-w-0">
                <span className="block text-xs text-muted-foreground">
                  أفضل اكتشاف
                </span>
                <span className="block truncate text-sm text-foreground">
                  {row.bestContribution.title}
                </span>
              </span>
            </Link>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{emptyText}</p>
      )}
    </Card>
  );
}

function LeaderboardList({ rows }: { rows: LeaderboardRow[] }) {
  const scored = rows.filter((r) => r.points > 0);
  if (scored.length === 0) {
    return (
      <p className="px-5 py-6 text-sm text-muted-foreground">
        لا توجد نقاط بعد هذا الأسبوع.
      </p>
    );
  }
  return (
    <ol className="divide-y divide-border">
      {scored.map((row) => (
        <li key={row.memberId}>
          <Link
            href={`/profile/${row.memberId}`}
            className="flex items-center gap-3 px-5 py-3 transition-colors duration-200 hover:bg-muted"
          >
            <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">
              {row.rank}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-foreground">
                {row.memberName}
              </span>
              <span className="block text-xs text-muted-foreground">
                احتُسب {row.counted} من {row.contributions}
              </span>
            </span>
            <span className="text-sm font-semibold tabular-nums text-foreground">
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
    <div className="space-y-8">
      <div>
        <h1 className="font-serif-display text-xl font-semibold tracking-tight text-foreground">
          الرئيسية
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {weekLabel(summary.week)} · {findsCount(summary.totals.thisWeek)}{" "}
          حتى الآن
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <LeaderCard
          label="مساهم الأسبوع"
          period={weekLabel(summary.week)}
          row={top}
          emptyText="لم يحصل أحد على نقاط بعد هذا الأسبوع."
        />
        <LeaderCard
          label="بطل الشهر"
          period={monthLabel(summary.month)}
          row={summary.monthlyChampion}
          emptyText="يبدأ سباق الشهر مع أول اكتشاف يُقيَّم."
        />
      </div>

      <YourStats
        weekly={summary.weekly}
        monthly={summary.monthly}
        totals={totals}
        latest={latest}
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                متصدرو الأسبوع
              </h2>
              <p className="text-xs text-muted-foreground">
                أفضل 3 اكتشافات لكل شخص
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/leaderboard">الكل</Link>
            </Button>
          </div>
          <LeaderboardList rows={summary.weekly} />
        </Card>

        <Card className="overflow-hidden lg:col-span-3">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                أحدث الاكتشافات
              </h2>
              <p className="text-xs text-muted-foreground">
                {summary.totals.contributions} إجمالًا ·{" "}
                {summary.totals.originals} أصلي ·{" "}
                {summary.totals.duplicates} مكرر
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/feed">الكل</Link>
            </Button>
          </div>
          <div className="p-2">
            {summary.recent.length === 0 ? (
              <div className="px-3 py-10 text-center">
                <p className="text-sm text-foreground">لا توجد مساهمات بعد</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  وجدت شيئًا مثيرًا للاهتمام في الذكاء الاصطناعي هذا الأسبوع؟
                </p>
                <Button asChild size="sm" className="mt-4">
                  <Link href="/">أضف الأول</Link>
                </Button>
              </div>
            ) : (
              summary.recent.map((c) => (
                <ContributionRow key={c.id} contribution={c} />
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
