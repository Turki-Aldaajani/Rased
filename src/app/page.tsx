import Composer from "@/components/Composer";
import HeroScene from "@/components/HeroScene";
import HomeTiles from "@/components/HomeTiles";
import QuietNav from "@/components/QuietNav";
import { DiamondRule } from "@/components/brand/DiamondRule";
import { Reveal } from "@/components/ui/reveal";
import { listContributions, listMembers } from "@/lib/db/store";
import { cycleLeaderboard } from "@/lib/services/leaderboard";
import { cycleKey, daysLeftInCycle } from "@/lib/util/date";

export const dynamic = "force-dynamic";

/**
 * The home page is still one action: paste a link. The grid around it holds
 * only what a member wants to know before pasting — what they have sent, how
 * long is left, who is ahead — and everything else is a click away.
 */
export default async function HomePage() {
  const [members, contributions] = await Promise.all([
    listMembers(),
    listContributions(),
  ]);

  const cycle = cycleKey(new Date());
  const inCycle = contributions.filter((c) => c.cycleKey === cycle);

  const perMember: Record<string, number> = {};
  for (const c of inCycle) {
    perMember[c.memberId] = (perMember[c.memberId] ?? 0) + 1;
  }

  const board = cycleLeaderboard(members, contributions, cycle);
  const top = board.find((r) => r.points > 0) ?? null;

  return (
    <div className="space-y-12 py-6 sm:py-10">
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="lg:col-span-2 lg:row-span-2">
          <Composer />
        </div>
        <HomeTiles
          perMember={perMember}
          thisCycle={inCycle.length}
          daysLeft={daysLeftInCycle()}
          leader={
            top ? { id: top.memberId, name: top.memberName, points: top.points } : null
          }
        />
      </div>

      <Reveal>
        <HeroScene />
      </Reveal>

      <DiamondRule />

      <QuietNav />
    </div>
  );
}
