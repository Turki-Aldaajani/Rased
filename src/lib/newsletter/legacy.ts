import { NEWSLETTER } from "@/lib/config/rules";
import type { LegacyIssue } from "./types";

/**
 * Issue #1 was written by hand and published before the engine existed. It is
 * registered here so numbering continues from it and the archive lists it,
 * and so the publisher knows its folder is taken and must never be written.
 *
 * Its items are dated 1–8 September 2026, which is cycle C0043
 * (31 Aug – 13 Sep 2026).
 */
export const LEGACY_ISSUES: readonly LegacyIssue[] = [
  {
    number: 1,
    cycleKey: "C0043",
    title: "نـشـرة الـذكـاء الاصـطـنـاعـي",
    lead: "لا نخبرك بكل ما حدث في الذكاء الاصطناعي، بل نختصر لك ما يستحق معرفته وما يمكنك استخدامه.",
    monthLabel: "سبتمبر 2026",
    monthIso: "2026-09",
    url: `${NEWSLETTER.publicBaseUrl}/01/index.html`,
    path: "01/index.html",
  },
];
