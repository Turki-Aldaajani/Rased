import Link from "next/link";
import { Card } from "@/components/ui/card";
import { POINTS } from "@/lib/config/rules";
import { listContributions, listMembers } from "@/lib/db/store";
import {
  cycleLeaderboard,
  knownCycles,
  type LeaderboardRow,
} from "@/lib/services/leaderboard";
import { contributionsCount, daysCount, pointsCount } from "@/lib/util/ar";
import { cycleKey, cycleLabel, daysLeftInCycle } from "@/lib/util/date";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ cycle?: string }> };

function Board({
  rows,
  emptyText,
}: {
  rows: LeaderboardRow[];
  emptyText: string;
}) {
  const scored = rows.filter((r) => r.points > 0);
  const unscored = rows.filter((r) => r.points === 0);

  if (scored.length === 0) {
    return <p className="px-5 py-8 text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <>
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
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {contributionsCount(row.submissions)} في الدورة
                  {row.overCap > 0 && ` · ${row.overCap} بعد بلوغ الحد`}
                  {row.atCap && " · بلغ الحد الأقصى"}
                </span>
              </span>
              <span className="shrink-0 text-end">
                <span className="block text-base font-semibold tabular-nums text-foreground">
                  {row.points}
                  <span className="text-xs text-muted-foreground">
                    /{POINTS.maxPerCycle}
                  </span>
                </span>
                <span className="block text-xs text-muted-foreground">نقاط</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      {unscored.length > 0 && (
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          بلا نقاط في هذه الدورة: {unscored.map((r) => r.memberName).join("، ")}
        </p>
      )}
    </>
  );
}

export default async function LeaderboardPage({ searchParams }: Props) {
  const { cycle: requested } = await searchParams;
  const [members, contributions] = await Promise.all([
    listMembers(),
    listContributions(),
  ]);

  const cycles = knownCycles(contributions);
  const current = cycleKey(new Date());
  const cycle = requested && cycles.includes(requested) ? requested : current;
  const rows = cycleLeaderboard(members, contributions, cycle);
  const isCurrent = cycle === current;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif-display text-xl font-semibold tracking-tight text-foreground">
          المتصدرون
        </h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          كل مساهمة صحيحة تساوي نقطة واحدة، مهما كان موضوعها، وبحد أقصى{" "}
          {pointsCount(POINTS.maxPerCycle)} لكل عضو في الدورة. الترتيب بالنقاط
          وحدها — لا بالقيمة التحريرية ولا بعدد الروابط.
        </p>
      </div>

      {/* Cycle history — old boards are kept, not overwritten. */}
      {cycles.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          {cycles.slice(0, 8).map((k) => (
            <Link
              key={k}
              href={k === current ? "/leaderboard" : `/leaderboard?cycle=${k}`}
              className={
                k === cycle
                  ? "text-foreground underline underline-offset-4"
                  : "text-muted-foreground transition-colors duration-200 hover:text-foreground"
              }
            >
              {cycleLabel(k)}
              {k === current && " (الحالية)"}
            </Link>
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">
            دورة {cycleLabel(cycle)}
          </h2>
          <p className="text-xs text-muted-foreground">
            {isCurrent
              ? `بقي ${daysCount(daysLeftInCycle())} في هذه الدورة`
              : "دورة منتهية"}
          </p>
        </div>
        <Board
          rows={rows}
          emptyText={
            isCurrent
              ? "لم يحصل أحد على نقاط في هذه الدورة بعد."
              : "لم تُسجَّل نقاط في هذه الدورة."
          }
        />
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-foreground">
          كيف تُحتسب النقاط
        </h2>
        <ul className="mt-4 grid gap-2.5 text-sm text-muted-foreground sm:grid-cols-2">
          <li>
            <span className="text-foreground">نقطة واحدة</span> — لكل مساهمة
            صحيحة وغير مكررة، أيًّا كان تصنيفها.
          </li>
          <li>
            <span className="text-foreground">{POINTS.maxPerCycle} نقاط</span> —
            الحد الأقصى لكل عضو في الدورة الواحدة (أسبوعان).
          </li>
          <li>
            <span className="text-foreground">الأهمية لا تزيد النقاط</span> —
            خبر كبير ومصدر تعليمي بسيط كلاهما نقطة واحدة.
          </li>
          <li>
            <span className="text-foreground">بعد بلوغ الحد</span> — أرسل ما
            تشاء؛ المساهمات تُحفظ وقد تدخل النشرة لكنها لا تزيد ترتيبك.
          </li>
          <li>
            <span className="text-foreground">المكرر</span> — لا نقطة، لكن
            المساهمة تبقى محفوظة.
          </li>
          <li>
            <span className="text-foreground">زاوية جديدة</span> — موضوع مطروق
            بتجربة أو مقارنة جديدة يُحتسب مساهمة كاملة.
          </li>
        </ul>
        <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
          القيمة التحريرية (0-100) تُحسب لكل مساهمة لترتيب محتوى النشرة، ولا
          تدخل في هذا الترتيب إطلاقًا.
        </p>
      </Card>
    </div>
  );
}
