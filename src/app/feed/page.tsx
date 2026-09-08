import Link from "next/link";
import { ContributionRow } from "@/components/ui";
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
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">All finds</h1>
        <p className="mt-1 text-sm text-muted">
          Everything the team has submitted, newest first. The best of these
          become the AI newsletter.
        </p>
      </div>

      {contributions.length === 0 ? (
        <div className="card px-6 py-12 text-center">
          <p className="text-sm font-semibold text-ink">Nothing here yet</p>
          <p className="mt-1 text-sm text-muted">
            The hunt starts with the first submission.
          </p>
          <Link href="/submit" className="btn-primary btn-sm mt-4">
            Add a contribution
          </Link>
        </div>
      ) : (
        [...byWeek.entries()].map(([week, items]) => (
          <section key={week} className="card overflow-hidden">
            <div className="border-b border-line px-5 py-3">
              <h2 className="text-sm font-bold text-ink">{weekLabel(week)}</h2>
              <p className="text-xs text-muted">
                {items.length} find{items.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="p-2">
              {items.map((c) => (
                <ContributionRow key={c.id} contribution={c} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
