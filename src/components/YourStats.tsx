"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { CountUp } from "@/components/ui/count-up";
import { POINTS } from "@/lib/config/rules";
import type { Contribution } from "@/lib/db/schema";
import type { LeaderboardRow } from "@/lib/services/leaderboard";
import { formatPoints, membersCount, pointsCount } from "@/lib/util/ar";
import { ContributionRow } from "./contribution";
import { useCurrentUser } from "./CurrentUser";

export interface YourStatsProps {
  board: LeaderboardRow[];
  totals: Record<string, { points: number; count: number }>;
  latest: Record<string, Contribution[]>;
  /** Computed on the server, where host-set cycle ends are known. */
  cycleText: string;
}

export default function YourStats({
  board,
  totals,
  latest,
  cycleText,
}: YourStatsProps) {
  const { member, ready, members, setMemberId } = useCurrentUser();

  if (!ready) {
    return <Card className="h-36" />;
  }

  if (!member) {
    return (
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-foreground">
          اختر اسمك لترى إحصاءاتك
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          بلا تسجيل، وبلا كلمة مرور.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {members.map((m) => (
            <Chip key={m.id} onClick={() => setMemberId(m.id)}>
              {m.name}
            </Chip>
          ))}
          {members.length === 0 && (
            <p className="text-sm text-muted-foreground">
              لا يوجد أعضاء بعد،{" "}
              <Link
                href="/admin"
                className="text-primary underline-offset-4 hover:underline"
              >
                أضف الفريق من الإدارة
              </Link>
              .
            </p>
          )}
        </div>
      </Card>
    );
  }

  const row = board.find((r) => r.memberId === member.id);
  const total = totals[member.id] ?? { points: 0, count: 0 };
  const mine = latest[member.id] ?? [];
  const points = row?.points ?? 0;
  const base = row?.basePoints ?? 0;
  const bonus = (row?.bonusPoints ?? 0) + (row?.diversityPoints ?? 0);
  const left = Math.max(0, POINTS.maxBasePerCycle - base);

  const tiles = [
    {
      label: "نقاط الدورة",
      value: points,
      sub:
        bonus > 0
          ? `أساس ${formatPoints(base)} · بونص ${formatPoints(bonus)}`
          : left > 0
            ? `أساس فقط، بقيت ${pointsCount(left)}`
            : "بلغت حد الأساس",
    },
    {
      label: "ترتيب الدورة",
      value: row && row.points > 0 ? row.rank : "لا يوجد",
      sub: `من أصل ${membersCount(board.length)}`,
    },
    {
      label: "مساهمات الدورة",
      value: row?.submissions ?? 0,
      sub:
        row && row.pendingBonuses > 0
          ? `${row.pendingBonuses} بونص بانتظار المضيف`
          : row && row.overCap > 0
            ? `${row.overCap} بعد الحد`
            : "كلها محفوظة",
    },
    {
      label: "إجمالي النقاط",
      value: total.points,
      sub: `من ${total.count} مساهمة`,
    },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{member.name}</p>
          <p className="text-xs text-muted-foreground">
            دورة {cycleText}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="ms-auto">
          <Link href={`/profile/${member.id}`}>الملف الكامل</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 divide-border sm:grid-cols-4 sm:divide-x">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="border-b border-border px-5 py-4 sm:border-b-0"
          >
            <p className="text-xs text-muted-foreground">{t.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {typeof t.value === "number" ? (
                <CountUp value={t.value} />
              ) : (
                t.value
              )}
            </p>
            <p className="text-xs text-muted-foreground">{t.sub}</p>
          </div>
        ))}
      </div>

      {left === 0 && (
        <p className="border-b border-border px-5 py-3 text-xs text-muted-foreground">
          بلغت حد نقاط الأساس لهذه الدورة. استمر في الإرسال، فالمساهمات تُحفظ
          وقد تدخل النشرة، والبونص على ما تكتبه ما زال يرفع ترتيبك.
        </p>
      )}

      <div className="p-2">
        {mine.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            لم تُرسل شيئًا بعد.{" "}
            <Link
              href="/"
              className="text-primary underline-offset-4 hover:underline"
            >
              أضف مساهمتك الأولى
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
    </Card>
  );
}
