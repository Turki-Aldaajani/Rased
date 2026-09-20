import { POINTS } from "@/lib/config/rules";
import {
  editorialScore,
  effectiveCategory,
  effectiveDuplicate,
  effectivePoints,
  effectiveStatus,
  type Contribution,
  type Member,
  type NewsletterCategory,
} from "@/lib/db/schema";
import { cycleKey, cycleKeysSince } from "@/lib/util/date";

/**
 * Standings are built from member points only.
 *
 * Not from the editorial score, not from how many links someone pasted, and
 * not from which newsletter category they landed in. Rasad is not here to
 * decide who is the better team member.
 */

export interface LeaderboardRow {
  memberId: string;
  memberName: string;
  points: number;
  /** Everything they sent this cycle, counted or not. */
  submissions: number;
  /** Submissions that earned a point. */
  counted: number;
  /** Valid submissions that earned nothing because the cap was already full. */
  overCap: number;
  atCap: boolean;
  rank: number;
}

function rank(rows: Omit<LeaderboardRow, "rank">[]): LeaderboardRow[] {
  const sorted = [...rows].sort(
    (a, b) =>
      b.points - a.points ||
      // A tie on points is a genuine tie; name order only keeps it stable.
      a.memberName.localeCompare(b.memberName),
  );
  let lastPoints: number | null = null;
  let lastRank = 0;
  return sorted.map((row, i) => {
    const r = row.points === lastPoints ? lastRank : i + 1;
    lastPoints = row.points;
    lastRank = r;
    return { ...row, rank: r };
  });
}

export function cycleLeaderboard(
  members: Member[],
  contributions: Contribution[],
  cycle: string,
): LeaderboardRow[] {
  const live = contributions.filter((c) => !c.removed && c.cycleKey === cycle);
  const rows = members.map((m) => {
    const mine = live.filter((c) => c.memberId === m.id);
    const points = mine.reduce((sum, c) => sum + effectivePoints(c), 0);
    const counted = mine.filter((c) => effectivePoints(c) > 0).length;
    const overCap = mine.filter(
      (c) => c.points.reason === "cycle_cap_reached",
    ).length;
    return {
      memberId: m.id,
      memberName: m.name,
      points,
      submissions: mine.length,
      counted,
      overCap,
      atCap: points >= POINTS.maxPerCycle,
    };
  });
  return rank(rows);
}

/** All cycles that have data, newest first — the historical record. */
export function knownCycles(contributions: Contribution[]): string[] {
  const earliest = contributions.reduce<string | null>(
    (min, c) => (min === null || c.createdAt < min ? c.createdAt : min),
    null,
  );
  const keys = cycleKeysSince(earliest);
  const current = cycleKey(new Date());
  return keys.includes(current) ? keys : [current, ...keys];
}

export interface MemberStats {
  member: Member;
  cycle: string;
  cyclePoints: number;
  cycleRank: number | null;
  cycleSubmissions: number;
  atCap: boolean;
  pointsLeft: number;
  totalPoints: number;
  totalSubmissions: number;
  /** Cycle-by-cycle record, newest first. */
  history: { cycle: string; points: number; submissions: number }[];
  recent: Contribution[];
}

export function memberStats(
  member: Member,
  members: Member[],
  contributions: Contribution[],
  now = new Date(),
): MemberStats {
  const cycle = cycleKey(now);
  const mine = contributions.filter(
    (c) => !c.removed && c.memberId === member.id,
  );
  const rows = cycleLeaderboard(members, contributions, cycle);
  const row = rows.find((r) => r.memberId === member.id);
  const cyclePoints = row?.points ?? 0;

  const history = knownCycles(mine)
    .map((key) => {
      const inCycle = mine.filter((c) => c.cycleKey === key);
      return {
        cycle: key,
        points: inCycle.reduce((sum, c) => sum + effectivePoints(c), 0),
        submissions: inCycle.length,
      };
    })
    .filter((h) => h.submissions > 0 || h.cycle === cycle);

  return {
    member,
    cycle,
    cyclePoints,
    cycleRank: row && row.points > 0 ? row.rank : null,
    cycleSubmissions: mine.filter((c) => c.cycleKey === cycle).length,
    atCap: cyclePoints >= POINTS.maxPerCycle,
    pointsLeft: Math.max(0, POINTS.maxPerCycle - cyclePoints),
    totalPoints: mine.reduce((sum, c) => sum + effectivePoints(c), 0),
    totalSubmissions: mine.length,
    history,
    recent: mine.slice(0, 5),
  };
}

export interface TeamSummary {
  cycle: string;
  board: LeaderboardRow[];
  leader: LeaderboardRow | null;
  recent: Contribution[];
  /** What the newsletter engine has to work with, per section. */
  categories: {
    category: NewsletterCategory;
    count: number;
    topEditorial: Contribution | null;
  }[];
  totals: {
    submissions: number;
    thisCycle: number;
    accepted: number;
    duplicates: number;
    rejected: number;
    pending: number;
    points: number;
  };
}

export function teamSummary(
  members: Member[],
  contributions: Contribution[],
  now = new Date(),
): TeamSummary {
  const cycle = cycleKey(now);
  const live = contributions.filter((c) => !c.removed);
  const board = cycleLeaderboard(members, contributions, cycle);
  const inCycle = live.filter((c) => c.cycleKey === cycle);

  const categories = (
    [
      "important_news",
      "new_models",
      "new_tools",
      "other_tools",
      "learn_this_week",
      "social_trends",
    ] as NewsletterCategory[]
  ).map((category) => {
    const items = inCycle
      .filter(
        (c) =>
          effectiveCategory(c) === category &&
          effectiveStatus(c) !== "rejected" &&
          effectiveStatus(c) !== "pending" &&
          effectiveStatus(c) !== "blocked_source",
      )
      .sort((a, b) => editorialScore(b) - editorialScore(a));
    return { category, count: items.length, topEditorial: items[0] ?? null };
  });

  return {
    cycle,
    board,
    leader: board.find((r) => r.points > 0) ?? null,
    recent: [...live]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 8),
    categories,
    totals: {
      submissions: live.length,
      thisCycle: inCycle.length,
      accepted: live.filter((c) =>
        ["accepted", "accepted_with_new_angle"].includes(effectiveStatus(c)),
      ).length,
      duplicates: live.filter((c) => effectiveDuplicate(c) === "duplicate")
        .length,
      rejected: live.filter((c) => effectiveStatus(c) === "rejected").length,
      pending: live.filter((c) => effectiveStatus(c) === "pending").length,
      points: inCycle.reduce((sum, c) => sum + effectivePoints(c), 0),
    },
  };
}
