import Link from "next/link";
import YourStats from "@/components/YourStats";
import { ContributionRow, categoryLabel } from "@/components/contribution";
import { DiamondRule } from "@/components/brand/DiamondRule";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CountUp } from "@/components/ui/count-up";
import { Reveal } from "@/components/ui/reveal";
import { editorialScore, type Contribution } from "@/lib/db/schema";
import { listContributions, listMembers } from "@/lib/db/store";
import {
  allTimePoints,
  teamSummary,
  type LeaderboardRow,
} from "@/lib/services/leaderboard";
import { contributionsCount, daysCount, pointsCount } from "@/lib/util/ar";
import { cycleLabel, daysLeftInCycle } from "@/lib/util/date";

export const dynamic = "force-dynamic";

function BoardList({ rows }: { rows: LeaderboardRow[] }) {
  const scored = rows.filter((r) => r.points > 0);
  if (scored.length === 0) {
    return (
      <p className="px-5 py-6 text-sm text-muted-foreground">
        لا توجد نقاط في هذه الدورة بعد.
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
                {contributionsCount(row.submissions)}
                {row.atCap && " · بلغ الحد"}
              </span>
            </span>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              <CountUp value={row.points} />
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
      points: allTimePoints(m.id, contributions),
      count: mine.length,
    };
    latest[m.id] = mine.slice(0, 3);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif-display text-xl font-semibold tracking-tight text-foreground">
          الرئيسية
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          دورة {cycleLabel(summary.cycle)} · بقي {daysCount(daysLeftInCycle())} ·{" "}
          {contributionsCount(summary.totals.thisCycle)} حتى الآن
        </p>
        <DiamondRule className="mt-5" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs text-muted-foreground">متصدر الدورة</p>
          {summary.leader ? (
            <>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {summary.leader.memberName}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {pointsCount(summary.leader.points)} ·{" "}
                {contributionsCount(summary.leader.submissions)}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              لم يحصل أحد على نقاط بعد.
            </p>
          )}
        </Card>
        <Card className="p-5">
          <p className="text-xs text-muted-foreground">نقاط الفريق</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
            <CountUp value={summary.totals.points} />
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">في هذه الدورة</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-muted-foreground">حالة المساهمات</p>
          <p className="mt-2 text-sm text-foreground">
            {summary.totals.accepted} مقبولة
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {summary.totals.duplicates} مكررة · {summary.totals.rejected} مرفوضة
            {summary.totals.pending > 0 &&
              ` · ${summary.totals.pending} بانتظار التقييم`}
            {summary.totals.pendingBonuses > 0 &&
              ` · ${summary.totals.pendingBonuses} بونص بانتظار المضيف`}
          </p>
        </Card>
      </div>

      <YourStats
        board={summary.board}
        totals={totals}
        latest={latest}
        cycleText={cycleLabel(summary.cycle)}
      />

      {/* What the newsletter has to work with, editorial, not points. */}
      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">
            جاهز للنشرة
          </h2>
          <p className="text-xs text-muted-foreground">
            محتوى هذه الدورة موزّعًا على أقسام النشرة، مرتّبًا بالقيمة التحريرية
           ، لا علاقة له بنقاط الأعضاء.
          </p>
        </div>
        <ul className="divide-y divide-border">
          {summary.categories.map((row) => (
            <li
              key={row.category}
              className="flex flex-wrap items-center gap-3 px-5 py-3"
            >
              <span className="w-40 shrink-0 text-sm text-foreground">
                {categoryLabel(row.category)}
              </span>
              <span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">
                {row.count}
              </span>
              {row.topEditorial ? (
                <Link
                  href={`/result/${row.topEditorial.id}`}
                  className="min-w-0 flex-1 truncate text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground"
                >
                  {row.topEditorial.title} · تحريريًا{" "}
                  {editorialScore(row.topEditorial)}
                </Link>
              ) : (
                <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                  لا يوجد محتوى بعد
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        <Reveal className="lg:col-span-2">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  ترتيب الدورة
                </h2>
                <p className="text-xs text-muted-foreground">
                  أساس وبونص مؤكَّد
                </p>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/leaderboard">الكل</Link>
              </Button>
            </div>
            <BoardList rows={summary.board} />
          </Card>
        </Reveal>

        <Reveal className="lg:col-span-3">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  أحدث المساهمات
                </h2>
                <p className="text-xs text-muted-foreground">
                  {summary.totals.submissions} إجمالًا
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
                    وجدت شيئًا مفيدًا في الذكاء الاصطناعي هذه الدورة؟
                  </p>
                  <Button asChild size="sm" className="mt-4">
                    <Link href="/">أضف الأولى</Link>
                  </Button>
                </div>
              ) : (
                summary.recent.map((c) => (
                  <ContributionRow key={c.id} contribution={c} />
                ))
              )}
            </div>
          </Card>
        </Reveal>
      </div>
    </div>
  );
}
