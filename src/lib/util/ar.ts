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

export function findsCount(n: number): string {
  return arPlural(n, ["اكتشاف واحد", "اكتشافان", `${n} اكتشافات`, `${n} اكتشافًا`]);
}

export function contributionsCount(n: number): string {
  return arPlural(n, ["مساهمة واحدة", "مساهمتان", `${n} مساهمات`, `${n} مساهمة`]);
}

export function pointsCount(n: number): string {
  return arPlural(n, ["نقطة واحدة", "نقطتان", `${n} نقاط`, `${n} نقطة`]);
}

export function membersCount(n: number): string {
  return arPlural(n, ["عضو واحد", "عضوان", `${n} أعضاء`, `${n} عضوًا`]);
}
