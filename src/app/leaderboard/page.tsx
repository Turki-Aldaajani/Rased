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
                      الأفضل: {row.bestContribution.title} (
                      {effectiveScore(row.bestContribution)} نقطة)
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-end">
                  <span className="block text-base font-semibold tabular-nums text-foreground">
                    {row.points}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    احتُسب {row.counted}/{row.contributions}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      {unscored.length > 0 && (
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          بلا نقاط بعد: {unscored.map((r) => r.memberName).join("، ")}
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
        <h1 className="font-serif-display text-xl font-semibold tracking-tight text-foreground">
          المتصدرون
        </h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          تُحتسب فقط أفضل {SCORING.bestContributionsPerWeek} اكتشافات لك كل
          أسبوع، وأفضل {SCORING.bestWeeksPerMonth} أسابيع كل شهر. الجودة تتغلب
          على الكم.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Board
          title="أسبوعي"
          subtitle={`${weekLabel(week)} · أفضل ${SCORING.bestContributionsPerWeek} اكتشافات لكل شخص`}
          rows={weekly}
          emptyText="لم يحصل أحد على نقاط هذا الأسبوع بعد."
        />
        <Board
          title="شهري"
          subtitle={`${monthLabel(month)} · أفضل ${SCORING.bestWeeksPerMonth} أسابيع لكل شخص`}
          rows={monthly}
          emptyText="لا توجد نقاط مسجَّلة هذا الشهر بعد."
        />
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-foreground">
          كيف تُحتسب النقاط
        </h2>
        <ul className="mt-4 grid gap-2.5 text-sm text-muted-foreground sm:grid-cols-2">
          <li>
            <span className="text-foreground">الأهمية</span> — مدى أهميته
            لفريق الذكاء الاصطناعي (الحد الأقصى {SCORING.maxPoints.importance}).
          </li>
          <li>
            <span className="text-foreground">الحداثة</span> — من تاريخ
            النشر الأصلي، لا تاريخ اكتشافك له (الحد الأقصى{" "}
            {SCORING.maxPoints.recency}).
          </li>
          <li>
            <span className="text-foreground">الفائدة</span> — القيمة
            العملية للمشاريع والدراسة (الحد الأقصى {SCORING.maxPoints.usefulness}).
          </li>
          <li>
            <span className="text-foreground">الملاءمة</span> — مدى توافقه
            مع التصنيف وتركيزنا على الذكاء الاصطناعي (الحد الأقصى{" "}
            {SCORING.maxPoints.relevance}).
          </li>
          <li>
            <span className="text-foreground">موثوقية المصدر</span> —
            المصادر الرسمية تحصل على أعلى تقييم (الحد الأقصى{" "}
            {SCORING.maxPoints.sourceReliability}).
          </li>
          <li>
            <span className="text-foreground">المساهمة الشخصية</span> —
            رأيك الخاص في "لماذا هذا مفيد؟" (الحد الأقصى{" "}
            {SCORING.maxPoints.personalContribution}).
          </li>
        </ul>
        <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
          يحتفظ التكرار بـ{" "}
          {Math.round(SCORING.duplicateMultiplier.duplicate * 100)}٪ من
          نقاطه، والتكرار الجزئي بـ{" "}
          {Math.round(SCORING.duplicateMultiplier.partial * 100)}٪. أما
          المصدر غير القابل للتحقق فيحتفظ بـ{" "}
          {Math.round(SCORING.verificationMultiplier.unverified * 100)}٪.
        </p>
      </Card>
    </div>
  );
}
