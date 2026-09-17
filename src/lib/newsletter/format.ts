/**
 * Arabic presentation helpers used by the renderer, matching how Issue #1
 * writes numbers, issue ordinals and months.
 */

const ARABIC_INDIC = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

/** 12 → "١٢", as Issue #1 numbers its headlines and cards. */
export function arabicDigits(n: number): string {
  return String(n)
    .split("")
    .map((d) => (/\d/.test(d) ? ARABIC_INDIC[Number(d)] : d))
    .join("");
}

const ORDINALS = [
  "",
  "الأول",
  "الثاني",
  "الثالث",
  "الرابع",
  "الخامس",
  "السادس",
  "السابع",
  "الثامن",
  "التاسع",
  "العاشر",
  "الحادي عشر",
  "الثاني عشر",
  "الثالث عشر",
  "الرابع عشر",
  "الخامس عشر",
  "السادس عشر",
  "السابع عشر",
  "الثامن عشر",
  "التاسع عشر",
  "العشرون",
];

/** 2 → "العدد الثاني"; past twenty the number is written out. */
export function issueOrdinal(n: number): string {
  return ORDINALS[n] ? `العدد ${ORDINALS[n]}` : `العدد ${n}`;
}

/** Two-digit folder name, e.g. 2 → "02". */
export function issueSlug(n: number): string {
  return String(n).padStart(2, "0");
}

const MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

/** "2026-09-27" → { label: "سبتمبر 2026", iso: "2026-09" } */
export function monthOf(isoDate: string): { label: string; iso: string } {
  const [y, m] = isoDate.split("-").map(Number);
  return {
    label: `${MONTHS[(m || 1) - 1]} ${y}`,
    iso: `${y}-${String(m || 1).padStart(2, "0")}`,
  };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only http(s) links reach the page; anything else becomes "#". */
export function safeUrl(value: string): string {
  try {
    const u = new URL(value);
    return /^https?:$/.test(u.protocol) ? escapeHtml(u.toString()) : "#";
  } catch {
    return "#";
  }
}
