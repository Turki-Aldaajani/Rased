import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ContributionRow,
  categoryLabel,
} from "@/components/contribution";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { POINTS } from "@/lib/config/rules";
import { getMember, listContributions, listMembers } from "@/lib/db/store";
import { memberStats } from "@/lib/services/leaderboard";
import { contributionsCount, membersCount, pointsCount } from "@/lib/util/ar";
import { cycleKey, cycleLabel } from "@/lib/util/date";

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
  const thisCycle = cycleKey(new Date());
  const mine = contributions.filter(
    (c) => c.memberId === member.id && !c.removed,
  );

  const tiles = [
    {
      label: "نقاط الدورة",
      value: `${stats.cyclePoints}/${POINTS.maxPerCycle}`,
      sub:
        stats.pointsLeft > 0
          ? `بقيت ${pointsCount(stats.pointsLeft)}`
          : "بلغ الحد الأقصى",
    },
    {
      label: "ترتيب الدورة",
      value: stats.cycleRank ?? "—",
      sub: `من أصل ${membersCount(members.length)}`,
    },
    {
      label: "مساهمات الدورة",
      value: stats.cycleSubmissions,
      sub: "كلها محفوظة",
    },
    {
      label: "إجمالي النقاط",
      value: stats.totalPoints,
      sub: "كل الدورات",
    },
    {
      label: "إجمالي المساهمات",
      value: stats.totalSubmissions,
      sub: "منذ البداية",
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
            {contributionsCount(stats.totalSubmissions)} ·{" "}
            {pointsCount(stats.totalPoints)} في كل الدورات
            {member.focusArea &&
              ` · مجال البحث: ${categoryLabel(member.focusArea)}`}
          </p>
        </div>
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

      {/* Cycle-by-cycle record — old cycles are preserved, never overwritten. */}
      {stats.history.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-foreground">
              سجل الدورات
            </h2>
          </div>
          <ul className="divide-y divide-border">
            {stats.history.map((h) => (
              <li
                key={h.cycle}
                className="flex items-center gap-4 px-5 py-3 text-sm"
              >
                <span className="min-w-0 flex-1 text-foreground">
                  {cycleLabel(h.cycle)}
                  {h.cycle === thisCycle && (
                    <span className="ms-2 text-xs text-muted-foreground">
                      الحالية
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {contributionsCount(h.submissions)}
                </span>
                <span className="w-12 text-end font-semibold tabular-nums text-foreground">
                  {h.points}
                  <span className="text-xs text-muted-foreground">
                    /{POINTS.maxPerCycle}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">السجل</h2>
          <p className="text-xs text-muted-foreground">
            كل شيء يبقى هنا، حتى ما لم تُحتسب له نقطة.
          </p>
        </div>
        <div className="p-2">
          {mine.length === 0 ? (
            <p className="px-3 py-6 text-sm text-muted-foreground">
              لا توجد مساهمات بعد.
            </p>
          ) : (
            mine.map((c) => (
              <ContributionRow key={c.id} contribution={c} showMember={false} />
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
