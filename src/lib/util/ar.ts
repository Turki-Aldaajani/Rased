/**
 * Arabic count agreement. Zero and 3-10 share the plural form; 1 and 2 have
 * their own words; 11+ takes the singular noun (tamyiz).
 */
export function arPlural(
  n: number,
  forms: [one: string, two: string, few: string, many: string],
): string {
  const [one, two, few, many] = forms;
  if (n === 1) return one;
  if (n === 2) return two;
  const m = Math.abs(n) % 100;
  if (n === 0 || (m >= 3 && m <= 10)) return few;
  return many;
}


export function contributionsCount(n: number): string {
  return arPlural(n, ["مساهمة واحدة", "مساهمتان", `${n} مساهمات`, `${n} مساهمة`]);
}

/**
 * Points come in halves now, so they are written as numbers, not words. A
 * whole number stays whole: "3", not "3.0".
 */
export function formatPoints(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function pointsCount(n: number): string {
  // Arabic count agreement is for whole things. Half a point takes the
  // singular noun and the digits carry the rest.
  if (!Number.isInteger(n)) return `${formatPoints(n)} نقطة`;
  return arPlural(n, ["نقطة واحدة", "نقطتان", `${n} نقاط`, `${n} نقطة`]);
}

export function sectionsCount(n: number): string {
  return arPlural(n, ["قسم واحد", "قسمان", `${n} أقسام`, `${n} قسمًا`]);
}

export function daysCount(n: number): string {
  return arPlural(n, ["يوم واحد", "يومان", `${n} أيام`, `${n} يومًا`]);
}

export function membersCount(n: number): string {
  return arPlural(n, ["عضو واحد", "عضوان", `${n} أعضاء`, `${n} عضوًا`]);
}
