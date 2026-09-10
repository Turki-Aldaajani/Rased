import Link from "next/link";
import { ContributionRow, EmptyState } from "@/components/contribution";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listContributions } from "@/lib/db/store";
import { findsCount } from "@/lib/util/ar";
import { weekLabel } from "@/lib/util/date";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const contributions = await listContributions();

  // Group by week so the feed reads like a running log of the competition.
  const byWeek = new Map<string, typeof contributions>();
  for (const c of contributions) {
    const list = byWeek.get(c.weekKey) ?? [];
    list.push(c);
    byWeek.set(c.weekKey, list);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="font-serif-display text-xl font-semibold tracking-tight text-foreground">
          كل الاكتشافات
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          كل ما أرسله الفريق، الأحدث أولًا.
        </p>
      </div>

      {contributions.length === 0 ? (
        <EmptyState
          title="لا يوجد شيء هنا بعد"
          body="يبدأ الصيد مع أول مساهمة."
          action={
            <Button asChild size="sm" className="mt-4">
              <Link href="/">أضف اكتشافًا</Link>
            </Button>
          }
        />
      ) : (
        [...byWeek.entries()].map(([week, items]) => (
          <Card key={week} className="overflow-hidden">
            <div className="border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold text-foreground">
                {weekLabel(week)}
              </h2>
              <p className="text-xs text-muted-foreground">
                {findsCount(items.length)}
              </p>
            </div>
            <div className="p-2">
              {items.map((c) => (
                <ContributionRow key={c.id} contribution={c} />
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
