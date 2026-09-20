"use client";

import Link from "next/link";
import { CountUp } from "@/components/ui/count-up";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { POINTS } from "@/lib/config/rules";
import { useCurrentUser } from "./CurrentUser";

export interface HomeTilesProps {
  /** Contributions made this cycle, per member id. */
  perMember: Record<string, number>;
  /** Everything the team sent this cycle. */
  thisCycle: number;
  daysLeft: number;
  leader: { id: string; name: string; points: number } | null;
}

function TileLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

/**
 * The small cells beside the composer. They answer the three things a member
 * wants to know before pasting anything, how much they have sent, how long
 * they have left, and who is ahead, and nothing else.
 */
export default function HomeTiles({
  perMember,
  thisCycle,
  daysLeft,
  leader,
}: HomeTilesProps) {
  const { member, ready } = useCurrentUser();
  const mine = member ? (perMember[member.id] ?? 0) : null;

  return (
    <>
      <SpotlightCard
        className="p-5 lg:col-span-1"
        contentClassName="flex flex-col justify-center"
        size={220}
      >
        <TileLabel>
          {mine === null ? "مساهمات الفريق" : "مساهماتك في هذه الدورة"}
        </TileLabel>
        {!ready ? (
          <span className="mt-3 block h-8 w-10 rounded bg-muted" />
        ) : (
          <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">
            <CountUp value={mine ?? thisCycle} />
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {mine === null
            ? "اختر اسمك ليصبح هذا عدّادك"
            : mine === 0
              ? "لم تُرسل شيئًا بعد"
              : "أرسلتها في هذه الدورة"}
        </p>
      </SpotlightCard>

      <SpotlightCard
        className="p-5 lg:col-span-1"
        contentClassName="flex flex-col justify-center"
        size={220}
      >
        <TileLabel>الأيام المتبقية</TileLabel>
        <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">
          <CountUp value={daysLeft} />
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          حتى تُقفل هذه الدورة
        </p>
      </SpotlightCard>

      <SpotlightCard
        className="p-5 lg:col-span-2"
        contentClassName="flex flex-col justify-center"
        size={300}
      >
        <TileLabel>أعلى متصدر حاليًا</TileLabel>
        {leader ? (
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <Link
              href={`/profile/${leader.id}`}
              className="text-xl font-semibold text-foreground hover:text-interactive"
            >
              {leader.name}
            </Link>
            <span className="text-xl font-semibold tabular-nums text-foreground">
              <CountUp value={leader.points} />
              <span className="text-xs text-muted-foreground">
                /{POINTS.maxPerCycle}
              </span>
            </span>
          </div>
        ) : (
          <p className="mt-2 text-xl font-semibold text-foreground">
            لا أحد بعد
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {leader
            ? "نقاط هذه الدورة، الترتيب بالنقاط وحدها"
            : "أول مساهمة صحيحة تتصدّر الدورة"}
        </p>
      </SpotlightCard>
    </>
  );
}
