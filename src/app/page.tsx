import Composer from "@/components/Composer";
import HeroScene from "@/components/HeroScene";
import QuietNav from "@/components/QuietNav";
import { listContributions } from "@/lib/db/store";
import { cycleKey } from "@/lib/util/date";

export const dynamic = "force-dynamic";

/**
 * The home page is one action: paste a link. Leaderboards, history, stats and
 * the host area are all a click away, and none of them are on this screen.
 */
export default async function HomePage() {
  const contributions = await listContributions();
  const cycle = cycleKey(new Date());
  const thisCycle = contributions.filter((c) => c.cycleKey === cycle).length;

  return (
    <div className="py-16 sm:py-24">
      <Composer />
      <HeroScene />
      <QuietNav thisCycle={thisCycle} />
    </div>
  );
}
