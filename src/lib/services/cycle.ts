import type { Contribution, Database } from "@/lib/db/schema";
import {
  ISO_DAY_RE,
  cycleEndWith,
  cycleKeyWith,
  cycleLabelWith,
  cycleStartWith,
  defaultCycleEnd,
  isoDay,
  nextCycleKey,
  previousCycleKey,
  setCycleEndOverrides,
  type CycleEndOverrides,
} from "@/lib/util/date";

/**
 * Host control over where the current cycle ends (issue #19).
 *
 * The anchor formula in rules.ts stays the default; a stored override moves
 * one cycle's last day. Moving it can carry contributions across the
 * boundary, so every change is planned first: the plan lists exactly which
 * contributions would change cycle, and the admin screen shows that list
 * before anything is saved.
 */

const DAY_MS = 86400000;

export class CycleEndError extends Error {}

export interface CycleEndMove {
  id: string;
  title: string;
  memberName: string;
  createdAt: string;
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
}

export interface CycleSchedule {
  cycle: string;
  start: string;
  end: string;
  defaultEnd: string;
  overridden: boolean;
  /** First day of the next cycle: when this cycle's points stop counting. */
  resetOn: string;
  next: { key: string; start: string; end: string };
  /** Bounds the admin may pick for `end`, inclusive. */
  minEnd: string;
  maxEnd: string;
  /** The cycle before, when a host moved its end; offered as an undo. */
  previous: { key: string; end: string; defaultEnd: string } | null;
  overrides: Record<string, string>;
}

export type CycleEndAction =
  | { action: "set"; end: string }
  | { action: "reset-previous" };

export interface CycleEndPlan {
  overrides: Record<string, string>;
  moves: CycleEndMove[];
}

function bounds(key: string, overrides: CycleEndOverrides) {
  const minEnd = cycleStartWith(key, overrides);
  // The next cycle keeps at least one day before its own anchor-grid end.
  const maxEnd = new Date(defaultCycleEnd(nextCycleKey(key)).getTime() - DAY_MS);
  return { minEnd, maxEnd };
}

export function cycleSchedule(db: Database, now: Date = new Date()): CycleSchedule {
  const overrides = db.cycleEndOverrides;
  const cycle = cycleKeyWith(now, overrides);
  const end = cycleEndWith(cycle, overrides);
  const next = nextCycleKey(cycle);
  const { minEnd, maxEnd } = bounds(cycle, overrides);
  const prev = previousCycleKey(cycle);
  const prevEnd = prev !== cycle ? overrides[prev] : undefined;

  return {
    cycle,
    start: isoDay(cycleStartWith(cycle, overrides)),
    end: isoDay(end),
    defaultEnd: isoDay(defaultCycleEnd(cycle)),
    overridden: Boolean(overrides[cycle]),
    resetOn: isoDay(new Date(end.getTime() + DAY_MS)),
    next: {
      key: next,
      start: isoDay(cycleStartWith(next, overrides)),
      end: isoDay(cycleEndWith(next, overrides)),
    },
    minEnd: isoDay(minEnd),
    maxEnd: isoDay(maxEnd),
    previous: prevEnd
      ? { key: prev, end: prevEnd, defaultEnd: isoDay(defaultCycleEnd(prev)) }
      : null,
    overrides: { ...overrides },
  };
}

/** Every stored override still leaves each affected cycle at least one day. */
function assertCoherent(overrides: CycleEndOverrides): void {
  for (const [key, end] of Object.entries(overrides)) {
    const day = new Date(`${end}T00:00:00Z`).getTime();
    const { minEnd, maxEnd } = bounds(key, overrides);
    if (day < minEnd.getTime() || day > maxEnd.getTime()) {
      throw new CycleEndError(
        "هذا التغيير يترك إحدى الدورات بلا أيام. راجع تاريخ نهاية الدورة الحالية أولًا.",
      );
    }
  }
}

/**
 * Contributions whose day lands in a different cycle under `next`. Only rows
 * the change actually touches are listed, so a row keyed by some older rule
 * is never re-keyed by an unrelated edit.
 */
function movesBetween(
  contributions: Contribution[],
  before: CycleEndOverrides,
  after: CycleEndOverrides,
): CycleEndMove[] {
  const moves: CycleEndMove[] = [];
  for (const c of contributions) {
    const from = cycleKeyWith(c.createdAt, before);
    const to = cycleKeyWith(c.createdAt, after);
    if (from === to) continue;
    moves.push({
      id: c.id,
      title: c.title,
      memberName: c.memberName,
      createdAt: c.createdAt,
      from: c.cycleKey,
      to,
      fromLabel: cycleLabelWith(from, before),
      toLabel: cycleLabelWith(to, after),
    });
  }
  return moves;
}

export function planCycleEnd(
  db: Database,
  request: CycleEndAction,
  now: Date = new Date(),
): CycleEndPlan {
  const before = db.cycleEndOverrides;
  const schedule = cycleSchedule(db, now);
  const after: Record<string, string> = { ...before };

  if (request.action === "set") {
    const end = request.end.trim();
    if (!ISO_DAY_RE.test(end) || Number.isNaN(new Date(`${end}T00:00:00Z`).getTime())) {
      throw new CycleEndError("التاريخ غير صالح.");
    }
    if (end < schedule.minEnd || end > schedule.maxEnd) {
      throw new CycleEndError(
        `اختر تاريخًا بين ${schedule.minEnd} و${schedule.maxEnd}، حتى تبقى لهذه الدورة وللتي تليها أيام.`,
      );
    }
    // Picking the formula's own date is a reset, not an override.
    if (end === schedule.defaultEnd) delete after[schedule.cycle];
    else after[schedule.cycle] = end;
  } else {
    if (!schedule.previous) {
      throw new CycleEndError("لم يُعدَّل تاريخ نهاية الدورة السابقة.");
    }
    delete after[schedule.previous.key];
  }

  assertCoherent(after);
  return {
    overrides: after,
    moves: movesBetween(
      db.contributions.filter((c) => !c.removed),
      before,
      after,
    ),
  };
}

/** Writes the plan into `db` (inside a `mutate`) and re-keys what moved. */
export function applyCycleEndPlan(db: Database, plan: CycleEndPlan): void {
  const before = db.cycleEndOverrides;
  // Removed rows move too, silently, so restoring one puts it in the right cycle.
  for (const c of db.contributions) {
    const from = cycleKeyWith(c.createdAt, before);
    const to = cycleKeyWith(c.createdAt, plan.overrides);
    if (from !== to) c.cycleKey = to;
  }
  db.cycleEndOverrides = { ...plan.overrides };
  setCycleEndOverrides(db.cycleEndOverrides);
}
