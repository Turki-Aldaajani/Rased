import Link from "next/link";
import { ContributionRow, EmptyState } from "@/components/contribution";
import { DiamondRule } from "@/components/brand/DiamondRule";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { effectivePoints } from "@/lib/db/schema";
import { listContributions } from "@/lib/db/store";
import { contributionsCount, pointsCount } from "@/lib/util/ar";
import { cycleLabel } from "@/lib/util/date";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const contributions = await listContributions();

  // Grouped by newsletter cycle, so the feed reads the way the newsletter does.
  const byCycle = new Map<string, typeof contributions>();
  for (const c of contributions) {
    const list = byCycle.get(c.cycleKey) ?? [];
    list.push(c);
    byCycle.set(c.cycleKey, list);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="font-serif-display text-xl font-semibold tracking-tight text-foreground">
          كل المساهمات
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          كل ما أرسله الفريق، الأحدث أولًا، بما في ذلك ما لم يُحتسب له نقاط.
        </p>
        <DiamondRule className="mt-5" />
      </div>

      {contributions.length === 0 ? (
        <EmptyState
          title="لا يوجد شيء هنا بعد"
          body="تبدأ الدورة مع أول مساهمة."
          action={
            <Button asChild size="sm" className="mt-4">
              <Link href="/">أضف مساهمة</Link>
            </Button>
          }
        />
      ) : (
        [...byCycle.entries()].map(([cycle, items]) => {
          const points = items.reduce((s, c) => s + effectivePoints(c), 0);
          return (
            <Reveal key={cycle}>
              <SpotlightCard>
                <div className="border-b border-border px-5 py-3">
                  <h2 className="text-sm font-semibold text-foreground">
                    دورة {cycleLabel(cycle)}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {contributionsCount(items.length)} · {pointsCount(points)}
                  </p>
                </div>
                <div className="p-2">
                  {items.map((c) => (
                    <ContributionRow key={c.id} contribution={c} />
                  ))}
                </div>
              </SpotlightCard>
            </Reveal>
          );
        })
      )}
    </div>
  );
}
