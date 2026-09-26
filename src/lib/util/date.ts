import { CYCLE } from "@/lib/config/rules";

/** ISO-8601 week key, e.g. "2026-W37". Weeks start Monday. */
export function weekKey(d: Date | string): string {
  const date = new Date(d);
  const t = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  // Thursday of the current week decides the year.
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Month key, e.g. "2026-09". */
export function monthKey(d: Date | string): string {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** All week keys that belong to a given month key, in order. */
export function weeksInMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const keys: string[] = [];
  const cursor = new Date(y, m - 1, 1);
  while (cursor.getMonth() === m - 1) {
    const k = weekKey(cursor);
    if (!keys.includes(k)) keys.push(k);
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

export function daysBetween(a: Date | string, b: Date | string): number {
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / 86400000,
  );
}

const AR_LOCALE = "ar-u-nu-latn";

/**
 * Newsletter cycles are fixed two-week windows counted from a Monday anchor,
 * so every member is measured against the same calendar and old cycles keep
 * their key forever.
 *
 * A host may move the last day of one cycle (`CycleEndOverrides`, stored in
 * the database). Only that cycle's end moves, and the next cycle starts the day
 * after it; that next cycle still ends on the anchor grid, so an extension never
 * drifts into the cycles after it.
 */

/** cycleKey -> last day of that cycle, "YYYY-MM-DD" (UTC), inclusive. */
export type CycleEndOverrides = Readonly<Record<string, string>>;

const DAY_MS = 86400000;
export const CYCLE_KEY_RE = /^C\d{4}$/;
export const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Set from the stored document every time the store hydrates it, so on the
// server any caller that has read the store sees the saved overrides.
let activeOverrides: CycleEndOverrides = {};

export function setCycleEndOverrides(overrides: CycleEndOverrides): void {
  activeOverrides = { ...overrides };
}

export function getCycleEndOverrides(): CycleEndOverrides {
  return activeOverrides;
}

function keyOf(idx: number): string {
  return `C${String(Math.max(0, idx)).padStart(4, "0")}`;
}

function indexOf(key: string): number {
  return Number(key.replace(/^C/, "")) || 0;
}

function dayUtc(d: Date | string): number {
  const date = new Date(d);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function defaultCycleStart(key: string): Date {
  const anchor = new Date(`${CYCLE.anchor}T00:00:00Z`);
  return new Date(anchor.getTime() + indexOf(key) * CYCLE.lengthDays * DAY_MS);
}

export function defaultCycleEnd(key: string): Date {
  return new Date(
    defaultCycleStart(key).getTime() + (CYCLE.lengthDays - 1) * DAY_MS,
  );
}

export function nextCycleKey(key: string): string {
  return keyOf(indexOf(key) + 1);
}

export function previousCycleKey(key: string): string {
  return keyOf(indexOf(key) - 1);
}

export function cycleStartWith(key: string, overrides: CycleEndOverrides): Date {
  const idx = indexOf(key);
  const previous = idx > 0 ? overrides[keyOf(idx - 1)] : undefined;
  return previous
    ? new Date(new Date(`${previous}T00:00:00Z`).getTime() + DAY_MS)
    : defaultCycleStart(key);
}

export function cycleEndWith(key: string, overrides: CycleEndOverrides): Date {
  const own = overrides[key];
  return own ? new Date(`${own}T00:00:00Z`) : defaultCycleEnd(key);
}

export function cycleIndexWith(
  d: Date | string,
  overrides: CycleEndOverrides,
): number {
  const anchor = new Date(`${CYCLE.anchor}T00:00:00Z`);
  const utc = dayUtc(d);
  let idx = Math.floor((utc - anchor.getTime()) / DAY_MS / CYCLE.lengthDays);
  // An override only ever moves a boundary by less than a cycle, so these
  // walk at most a step or two.
  while (utc > cycleEndWith(keyOf(idx), overrides).getTime()) idx++;
  while (idx > 0 && utc < cycleStartWith(keyOf(idx), overrides).getTime()) idx--;
  return idx;
}

export function cycleKeyWith(
  d: Date | string,
  overrides: CycleEndOverrides,
): string {
  return keyOf(cycleIndexWith(d, overrides));
}

export function cycleIndex(d: Date | string): number {
  return cycleIndexWith(d, activeOverrides);
}

/** Cycle key, e.g. "C0044". Fixed width so it sorts lexicographically. */
export function cycleKey(d: Date | string): string {
  return keyOf(cycleIndex(d));
}

export function cycleStart(key: string): Date {
  return cycleStartWith(key, activeOverrides);
}

export function cycleEnd(key: string): Date {
  return cycleEndWith(key, activeOverrides);
}

/** Every cycle key from the earliest given date up to now, newest first. */
export function cycleKeysSince(earliest: string | null): string[] {
  const from = earliest ? cycleIndex(earliest) : cycleIndex(new Date());
  const to = cycleIndex(new Date());
  const keys: string[] = [];
  for (let i = Math.max(0, from); i <= to; i++) {
    keys.push(`C${String(i).padStart(4, "0")}`);
  }
  return keys.reverse();
}

/** Human label for a cycle, e.g. "8 – 21 سبتمبر 2026". */
export function cycleLabel(key: string): string {
  return cycleLabelWith(key, activeOverrides);
}

export function cycleLabelWith(key: string, overrides: CycleEndOverrides): string {
  const start = cycleStartWith(key, overrides);
  const end = cycleEndWith(key, overrides);
  const fmt = (d: Date, withMonth: boolean, withYear: boolean) =>
    d.toLocaleDateString(AR_LOCALE, {
      day: "numeric",
      ...(withMonth ? { month: "short" } : {}),
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    });
  const sameMonth =
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCFullYear() === end.getUTCFullYear();
  return `${fmt(start, !sameMonth, false)} – ${fmt(end, true, true)}`;
}

/** A "YYYY-MM-DD" day as e.g. "الأربعاء، 30 سبتمبر 2026", read in UTC like the cycles. */
export function formatDayUtc(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(AR_LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Days left in the cycle that contains `d`, counting today. */
export function daysLeftInCycle(d: Date = new Date()): number {
  const end = cycleEnd(cycleKey(d));
  return Math.max(0, daysBetween(d, end) + 1);
}


export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "غير معروف";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString(AR_LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} د`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `منذ ${hrs} س`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `منذ ${days} يوم`;
  return formatDate(iso);
}

/** Human label for the current week, e.g. "8–14 سبتمبر". */
export function weekLabel(key: string): string {
  const [yearStr, weekStr] = key.split("-W");
  const year = Number(yearStr);
  const week = Number(weekStr);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d: Date, withMonth: boolean) =>
    d.toLocaleDateString(AR_LOCALE, {
      day: "numeric",
      ...(withMonth ? { month: "short" } : {}),
      timeZone: "UTC",
    });
  const sameMonth = monday.getUTCMonth() === sunday.getUTCMonth();
  return `${fmt(monday, !sameMonth)} – ${fmt(sunday, true)}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(AR_LOCALE, {
    month: "long",
    year: "numeric",
  });
}
