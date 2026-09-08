import Link from "next/link";
import { ContributionRow, EmptyState } from "@/components/contribution";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listContributions } from "@/lib/db/store";
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
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          All finds
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything the team has submitted, newest first.
        </p>
      </div>

      {contributions.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body="The hunt starts with the first submission."
          action={
            <Button asChild size="sm" className="mt-4">
              <Link href="/">Add a find</Link>
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
                {items.length} find{items.length === 1 ? "" : "s"}
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
