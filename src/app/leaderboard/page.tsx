import Link from "next/link";
import { DiamondRule } from "@/components/brand/DiamondRule";
import { Card } from "@/components/ui/card";
import { CountUp } from "@/components/ui/count-up";
import { Reveal } from "@/components/ui/reveal";
import { BONUS, POINTS } from "@/lib/config/rules";
import { NEWSLETTER_CATEGORIES } from "@/lib/db/schema";
import { CATEGORY_LABELS } from "@/components/contribution";
import { listContributions, listMembers } from "@/lib/db/store";
import {
  cycleLeaderboard,
  knownCycles,
  type LeaderboardRow,
} from "@/lib/services/leaderboard";
import {
  contributionsCount,
  daysCount,
  formatPoints,
  sectionsCount,
} from "@/lib/util/ar";
import { REQUIREMENT_LABELS } from "@/lib/services/bonus";
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
                  {row.atCap && " · بلغ حد الأساس"}
                </span>
                {/* Where the number came from, so nobody has to ask. */}
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  أساس {formatPoints(row.basePoints)}
                  {row.bonusPoints > 0 &&
                    ` · بونص ${formatPoints(row.bonusPoints)}`}
                  {row.diversityPoints > 0 &&
                    ` · تنوّع ${formatPoints(row.diversityPoints)}`}
                  {/* Parenthesised, not "· 1 بونص": a digit either side of a
                      separator reads as one number in RTL. */}
                  {row.pendingBonuses > 0 &&
                    ` · بونص بانتظار المضيف (${row.pendingBonuses})`}
                </span>
              </span>
              <span className="shrink-0 text-end">
                <span className="block text-base font-semibold tabular-nums text-foreground">
                  <CountUp value={row.points} />
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
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          نقطة أساس لكل مساهمة صحيحة مهما كان موضوعها، وبونص على ما تكتبه أنت
          فوقها. الترتيب بمجموع الاثنين، لا بالقيمة التحريرية ولا بعدد الروابط.
        </p>
        <DiamondRule className="mt-5" />
      </div>

      {/* Cycle history, old boards are kept, not overwritten. */}
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

      <Reveal>
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground">
            كيف تُحتسب النقاط
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            نقاطك مبنية على شيئين: أن تجد، وأن تكتب.
          </p>

          <h3 className="mt-5 text-sm font-medium text-foreground">
            أولًا: نقطة الأساس
          </h3>
          <ul className="mt-2 grid gap-2.5 text-sm text-muted-foreground sm:grid-cols-2">
            <li>
              <span className="text-foreground">نقطة واحدة</span> لكل مساهمة
              صحيحة وغير مكررة، أيًّا كان تصنيفها.
            </li>
            <li>
              <span className="text-foreground">
                {formatPoints(POINTS.maxBasePerCycle)} نقاط
              </span>{" "}
              حد الأساس لكل عضو في الدورة (أسبوعان). البونص لا يدخل هذا الحد.
            </li>
            <li>
              <span className="text-foreground">المكرر</span> لا نقطة له، لكن
              المساهمة تبقى محفوظة.
            </li>
            <li>
              <span className="text-foreground">زاوية جديدة</span> على موضوع
              مطروق تُحتسب مساهمة كاملة.
            </li>
          </ul>

          <h3 className="mt-6 text-sm font-medium text-foreground">
            ثانيًا: البونص، على ما تكتبه
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            كل قسم يطلب شيئًا واحدًا فوق الرابط نفسه. اكتبه بكلماتك مع الخبر،
            ويقترحه رصد، ثم يؤكده المضيف قبل أن يدخل اللوحة.
          </p>
          <ul className="mt-3 divide-y divide-border rounded-md border border-border">
            {NEWSLETTER_CATEGORIES.map((category) => {
              const rule = BONUS.bySection[category];
              return (
                <li
                  key={category}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm"
                >
                  <span className="w-36 shrink-0 text-foreground">
                    {CATEGORY_LABELS[category]}
                  </span>
                  <span className="min-w-0 flex-1 text-muted-foreground">
                    {REQUIREMENT_LABELS[rule.requirement]}
                  </span>
                  <span className="shrink-0 tabular-nums text-foreground">
                    +{formatPoints(rule.value)}
                  </span>
                </li>
              );
            })}
          </ul>
          <ul className="mt-3 grid gap-2.5 text-sm text-muted-foreground sm:grid-cols-2">
            <li>
              <span className="text-foreground">لا بونص بلا خبر.</span> نص وحده،
              مهما كان جيدًا، لا يساوي شيئًا بلا مساهمة صحيحة تحته.
            </li>
            <li>
              <span className="text-foreground">كيفية الاستخدام مرة واحدة</span>{" "}
              في الدورة. أدوات أخرى ترسلها بعدها تأخذ نقطة الأساس وحدها.
            </li>
            <li>
              <span className="text-foreground">
                تنوّع +{formatPoints(BONUS.diversity.value)}
              </span>{" "}
              لمن غطّى {sectionsCount(BONUS.diversity.sections)} مختلفة أو أكثر
              في الدورة، مرة واحدة.
            </li>
            <li>
              <span className="text-foreground">القسم يحدده رصد</span> من محتوى
              الرابط ونصّك، ويؤكده المضيف. لم يعد اختيارًا لك.
            </li>
          </ul>

          <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
            القيمة التحريرية (0-100) تُحسب لكل مساهمة لترتيب محتوى النشرة، ولا
            تدخل في هذا الترتيب إطلاقًا، لا في الأساس ولا في البونص.
          </p>
        </Card>
      </Reveal>
    </div>
  );
}
