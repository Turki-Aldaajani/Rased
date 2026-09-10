import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContributionRow, ScoreRing, typeLabel } from "@/components/contribution";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SCORING } from "@/lib/config/scoring";
import { effectiveScore } from "@/lib/db/schema";
import { getMember, listContributions, listMembers } from "@/lib/db/store";
import { memberStats } from "@/lib/services/leaderboard";
import { contributionsCount, membersCount } from "@/lib/util/ar";
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
    { label: "إجمالي النقاط", value: stats.totalPoints, sub: "كل الأوقات" },
    {
      label: "نقاط الأسبوع",
      value: stats.weeklyPoints,
      sub: `أفضل ${SCORING.bestContributionsPerWeek} اكتشافات`,
    },
    {
      label: "نقاط الشهر",
      value: stats.monthlyPoints,
      sub: `أفضل ${SCORING.bestWeeksPerMonth} أسابيع`,
    },
    {
      label: "ترتيب الأسبوع",
      value: stats.weeklyPoints > 0 ? (stats.weeklyRank ?? "—") : "—",
      sub: `من أصل ${membersCount(members.length)}`,
    },
    {
      label: "المساهمات",
      value: stats.contributionCount,
      sub: `${stats.weeklyCount} هذا الأسبوع`,
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ms-3">
        <Link href="/leaderboard">
          <ArrowRight />
          المتصدرون
        </Link>
      </Button>

      <Card className="flex flex-wrap items-center gap-4 p-5">
        <div className="min-w-0 flex-1">
          <h1 className="font-serif-display text-lg font-semibold text-foreground">
            {member.name}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {contributionsCount(stats.contributionCount)} ·{" "}
            {stats.totalPoints} نقطة في كل الأوقات
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
            أفضل مساهمة
          </h2>
          <Link
            href={`/result/${stats.bestContribution.id}`}
            className="mt-3 flex items-start gap-3"
          >
            <span className="w-8 shrink-0 text-end text-sm font-semibold tabular-nums text-foreground">
              {effectiveScore(stats.bestContribution)}
            </span>
            <span className="min-w-0">
              <span className="block text-sm text-foreground">
                {stats.bestContribution.title}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {typeLabel(stats.bestContribution.type)} ·{" "}
                {stats.bestContribution.evaluation.reason}
              </span>
            </span>
          </Link>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">السجل</h2>
          <p className="text-xs text-muted-foreground">
            كل شيء يُحتسب في السجل؛ فقط أفضل{" "}
            {SCORING.bestContributionsPerWeek} من كل أسبوع تُحتسب في الترتيب.
          </p>
        </div>
        <div className="p-2">
          {stats.history.length === 0 ? (
            <p className="px-3 py-6 text-sm text-muted-foreground">
              لا توجد مساهمات بعد.
            </p>
          ) : (
            stats.history.map((c) => (
              <div key={c.id} className="relative">
                <ContributionRow contribution={c} showMember={false} />
                {c.weekKey === thisWeek && (
                  <span className="pointer-events-none absolute end-3 top-3.5 text-xs text-muted-foreground">
                    هذا الأسبوع
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
