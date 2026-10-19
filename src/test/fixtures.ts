import { emptyBonus, type Contribution, type Database, type Member } from "@/lib/db/schema";
import { cycleKey, cycleStart, previousCycleKey } from "@/lib/util/date";

/** Test fixtures. Cycles are relative to today, so the tests never go stale. */

export const NOW = new Date();
export const CURRENT = cycleKey(NOW);
export const PREVIOUS = previousCycleKey(CURRENT);
export const OLDER = previousCycleKey(PREVIOUS);

/** A moment inside a cycle, `day` days after it starts. */
export function inCycle(key: string, day = 1): string {
  return new Date(cycleStart(key).getTime() + day * 86400000 + 3600000).toISOString();
}

export function member(id = "m1", name = "Reem"): Member {
  return {
    id,
    name,
    createdAt: inCycle(OLDER, 0),
    active: true,
    focusArea: null,
    showNameOnDiscoveries: true,
  };
}

let seq = 0;

export function contribution(over: Partial<Contribution> = {}): Contribution {
  const key = over.cycleKey ?? CURRENT;
  const createdAt = over.createdAt ?? inCycle(key);
  return {
    id: `c${++seq}`,
    memberId: "m1",
    memberName: "Reem",
    title: `Item ${seq}`,
    url: `https://example.com/${seq}`,
    description: "",
    memberReason: "",
    note: "",
    focusArea: null,
    createdAt,
    cycleKey: key,
    weekKey: "",
    monthKey: "",
    status: "accepted",
    evaluation: null,
    points: { awarded: 1, reason: "valid_contribution", cycleKey: key, cycleTotalBefore: 0 },
    evaluationError: null,
    evaluationAttempts: 1,
    bonus: emptyBonus(),
    adminOverride: null,
    removed: false,
    ...over,
  };
}

export function database(contributions: Contribution[], over: Partial<Database> = {}): Database {
  return {
    members: [member()],
    contributions,
    newsletters: [],
    cycleEndOverrides: {},
    reviewers: [],
    ...over,
  };
}
