"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Contribution } from "@/lib/db/schema";
import type { LeaderboardRow } from "@/lib/services/leaderboard";
import { membersCount, pointsCount } from "@/lib/util/ar";
import { ContributionRow } from "./contribution";
import { useCurrentUser } from "./CurrentUser";

export interface YourStatsProps {
  weekly: LeaderboardRow[];
  monthly: LeaderboardRow[];
  totals: Record<string, { points: number; count: number }>;
  latest: Record<string, Contribution[]>;
}

export default function YourStats({
  weekly,
  monthly,
  totals,
  latest,
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
        <div className="mt-3 flex flex-wrap gap-1">
          {members.map((m) => (
            <Button
              key={m.id}
              variant="ghost"
              size="sm"
              onClick={() => setMemberId(m.id)}
            >
              {m.name}
            </Button>
          ))}
          {members.length === 0 && (
            <p className="text-sm text-muted-foreground">
              لا يوجد أعضاء بعد —{" "}
              <Link href="/admin" className="text-primary underline-offset-4 hover:underline">
                أضف الفريق من الإدارة
              </Link>
              .
            </p>
          )}
        </div>
      </Card>
    );
  }

  const week = weekly.find((r) => r.memberId === member.id);
  const month = monthly.find((r) => r.memberId === member.id);
  const total = totals[member.id] ?? { points: 0, count: 0 };
  const mine = latest[member.id] ?? [];

  const tiles = [
    { label: "نقاط الأسبوع", value: week?.points ?? 0, sub: "أفضل 3 اكتشافات" },
    {
      label: "ترتيب الأسبوع",
      value: week && week.points > 0 ? week.rank : "—",
      sub: `من أصل ${membersCount(weekly.length)}`,
    },
    { label: "نقاط الشهر", value: month?.points ?? 0, sub: "أفضل 3 أسابيع" },
    {
      label: "المساهمات",
      value: total.count,
      sub: `${pointsCount(total.points)} إجمالًا`,
    },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {member.name}
          </p>
          <p className="text-xs text-muted-foreground">موسمك حتى الآن</p>
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
              {t.value}
            </p>
            <p className="text-xs text-muted-foreground">{t.sub}</p>
          </div>
        ))}
      </div>

      <div className="p-2">
        {mine.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            لم تُرسل شيئًا بعد.{" "}
            <Link
              href="/"
              className="text-primary underline-offset-4 hover:underline"
            >
              أضف اكتشافك الأول
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
