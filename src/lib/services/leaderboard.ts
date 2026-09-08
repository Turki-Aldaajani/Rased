import { SCORING } from "@/lib/config/scoring";
import {
  effectiveDuplicate,
  effectiveScore,
  type Contribution,
  type Member,
} from "@/lib/db/schema";
import { monthKey, weekKey, weeksInMonth } from "@/lib/util/date";

export interface LeaderboardRow {
  memberId: string;
  memberName: string;
  points: number;
  contributions: number;
  /** How many of those actually counted toward the points. */
  counted: number;
  bestContribution: Contribution | null;
  rank: number;
}

function bestN(list: Contribution[], n: number): Contribution[] {
  return [...list]
    .sort((a, b) => effectiveScore(b) - effectiveScore(a))
    .slice(0, n);
}

function rank(rows: Omit<LeaderboardRow, "rank">[]): LeaderboardRow[] {
  const sorted = [...rows].sort(
    (a, b) =>
      b.points - a.points ||
      b.contributions - a.contributions ||
      a.memberName.localeCompare(b.memberName),
  );
  let lastPoints: number | null = null;
  let lastRank = 0;
  return sorted.map((row, i) => {
    // Equal scores share a rank, which matters for ties at the top.
    const r = row.points === lastPoints ? lastRank : i + 1;
    lastPoints = row.points;
    lastRank = r;
    return { ...row, rank: r };
  });
}

/**
 * Weekly board: only each member's best N contributions of that week count,
 * which is what stops someone farming points by submitting a dozen links.
 */
export function weeklyLeaderboard(
  members: Member[],
  contributions: Contribution[],
  week: string,
): LeaderboardRow[] {
  const live = contributions.filter((c) => !c.removed && c.weekKey === week);
  const rows = members.map((m) => {
    const mine = live.filter((c) => c.memberId === m.id);
    const counting = bestN(mine, SCORING.bestContributionsPerWeek);
    return {
      memberId: m.id,
      memberName: m.name,
      points: counting.reduce((sum, c) => sum + effectiveScore(c), 0),
      contributions: mine.length,
      counted: counting.length,
      bestContribution: counting[0] ?? null,
    };
  });
  return rank(rows);
}

/** Points a single member earned in one week, under the best-N rule. */
export function weeklyPointsFor(
  memberId: string,
  contributions: Contribution[],
  week: string,
): number {
  const mine = contributions.filter(
    (c) => !c.removed && c.memberId === memberId && c.weekKey === week,
  );
  return bestN(mine, SCORING.bestContributionsPerWeek).reduce(
    (sum, c) => sum + effectiveScore(c),
    0,
  );
}

/**
 * Monthly board: accumulated weekly performance, counting each member's best
 * weeks rather than every submission.
 */
export function monthlyLeaderboard(
  members: Member[],
  contributions: Contribution[],
  month: string,
): LeaderboardRow[] {
  const weeks = weeksInMonth(month);
  const inMonth = contributions.filter(
    (c) => !c.removed && c.monthKey === month,
  );
  const rows = members.map((m) => {
    const weekTotals = weeks
      .map((w) => weeklyPointsFor(m.id, contributions, w))
      .sort((a, b) => b - a)
      .slice(0, SCORING.bestWeeksPerMonth);
    const mine = inMonth.filter((c) => c.memberId === m.id);
    return {
      memberId: m.id,
      memberName: m.name,
      points: weekTotals.reduce((a, b) => a + b, 0),
      contributions: mine.length,
      counted: weekTotals.filter((t) => t > 0).length,
      bestContribution: bestN(mine, 1)[0] ?? null,
    };
  });
  return rank(rows);
}

export interface MemberStats {
  member: Member;
  totalPoints: number;
  weeklyPoints: number;
  monthlyPoints: number;
  weeklyRank: number | null;
  monthlyRank: number | null;
  contributionCount: number;
  weeklyCount: number;
  bestContribution: Contribution | null;
  history: Contribution[];
}

export function memberStats(
  member: Member,
  members: Member[],
  contributions: Contribution[],
  now = new Date(),
): MemberStats {
  const week = weekKey(now);
  const month = monthKey(now);
  const mine = contributions.filter(
    (c) => !c.removed && c.memberId === member.id,
  );
  const weekRows = weeklyLeaderboard(members, contributions, week);
  const monthRows = monthlyLeaderboard(members, contributions, month);
  const weekRow = weekRows.find((r) => r.memberId === member.id);
  const monthRow = monthRows.find((r) => r.memberId === member.id);

  return {
    member,
    totalPoints: mine.reduce((sum, c) => sum + effectiveScore(c), 0),
    weeklyPoints: weekRow?.points ?? 0,
    monthlyPoints: monthRow?.points ?? 0,
    weeklyRank: weekRow?.rank ?? null,
    monthlyRank: monthRow?.rank ?? null,
    contributionCount: mine.length,
    weeklyCount: mine.filter((c) => c.weekKey === week).length,
    bestContribution: bestN(mine, 1)[0] ?? null,
    history: mine,
  };
}

export interface TeamSummary {
  week: string;
  month: string;
  weekly: LeaderboardRow[];
  monthly: LeaderboardRow[];
  contributorOfTheWeek: LeaderboardRow | null;
  monthlyChampion: LeaderboardRow | null;
  recent: Contribution[];
  totals: {
    contributions: number;
    thisWeek: number;
    originals: number;
    duplicates: number;
    averageScore: number;
  };
}

export function teamSummary(
  members: Member[],
  contributions: Contribution[],
  now = new Date(),
): TeamSummary {
  const week = weekKey(now);
  const month = monthKey(now);
  const live = contributions.filter((c) => !c.removed);
  const weekly = weeklyLeaderboard(members, contributions, week);
  const monthly = monthlyLeaderboard(members, contributions, month);

  const totalScore = live.reduce((sum, c) => sum + effectiveScore(c), 0);

  return {
    week,
    month,
    weekly,
    monthly,
    contributorOfTheWeek: weekly.find((r) => r.points > 0) ?? null,
    monthlyChampion: monthly.find((r) => r.points > 0) ?? null,
    recent: [...live]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 8),
    totals: {
      contributions: live.length,
      thisWeek: live.filter((c) => c.weekKey === week).length,
      originals: live.filter((c) => effectiveDuplicate(c) === "original").length,
      duplicates: live.filter((c) => effectiveDuplicate(c) === "duplicate")
        .length,
      averageScore: live.length ? Math.round(totalScore / live.length) : 0,
    },
  };
}
