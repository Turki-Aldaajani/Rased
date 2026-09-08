import Composer from "@/components/Composer";
import QuietNav from "@/components/QuietNav";
import { listContributions } from "@/lib/db/store";
import { weekKey } from "@/lib/util/date";

export const dynamic = "force-dynamic";

/**
 * The home page is one action: paste a link. Leaderboards, history, stats and
 * the host area are all a click away, and none of them are on this screen.
 */
export default async function HomePage() {
  const contributions = await listContributions();
  const week = weekKey(new Date());
  const thisWeek = contributions.filter((c) => c.weekKey === week).length;

  return (
    <div className="py-16 sm:py-24">
      <Composer />
      <QuietNav thisWeek={thisWeek} />
    </div>
  );
}
