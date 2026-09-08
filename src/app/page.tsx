import Composer from "@/components/Composer";
import QuietNav from "@/components/QuietNav";
import { listContributions } from "@/lib/db/store";
import { weekKey } from "@/lib/util/date";

export const dynamic = "force-dynamic";

/**
 * The home page is one action: paste a link.
 * Leaderboards, history, stats and the host area all live a click away — a
 * member should be able to hunt without reading anything first.
 */
export default async function HomePage() {
  const contributions = await listContributions();
  const week = weekKey(new Date());
  const thisWeek = contributions.filter((c) => c.weekKey === week).length;

  return (
    <div className="flex flex-col justify-center py-6 sm:py-12">
      <Composer />
      <QuietNav thisWeek={thisWeek} />
    </div>
  );
}
