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
 */
export function cycleIndex(d: Date | string): number {
  const anchor = new Date(`${CYCLE.anchor}T00:00:00Z`);
  const date = new Date(d);
  const utc = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  return Math.floor((utc - anchor.getTime()) / 86400000 / CYCLE.lengthDays);
}

/** Cycle key, e.g. "C0044". Fixed width so it sorts lexicographically. */
export function cycleKey(d: Date | string): string {
  const idx = cycleIndex(d);
  return `C${String(Math.max(0, idx)).padStart(4, "0")}`;
}

export function cycleStart(key: string): Date {
  const idx = Number(key.replace(/^C/, "")) || 0;
  const anchor = new Date(`${CYCLE.anchor}T00:00:00Z`);
  return new Date(anchor.getTime() + idx * CYCLE.lengthDays * 86400000);
}

export function cycleEnd(key: string): Date {
  return new Date(
    cycleStart(key).getTime() + (CYCLE.lengthDays - 1) * 86400000,
  );
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
  const start = cycleStart(key);
  const end = cycleEnd(key);
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
