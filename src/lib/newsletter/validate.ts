import { NEWSLETTER } from "@/lib/config/rules";
import type { Contribution } from "@/lib/db/schema";
import { daysBetween } from "@/lib/util/date";
import { sameResource } from "@/lib/util/text";
import { sectionById, type SectionId } from "./sections";
import type { NewsletterIssue, NewsletterItem, ReviewFlag } from "./types";

/**
 * Pipeline step 7, check what was written against what the contribution
 * actually says.
 *
 * These checks are mechanical and deliberately suspicious. They do not block
 * anything on their own: they put a flag in front of the editor, and a draft
 * with open warnings cannot be published until someone acknowledges them.
 */

/** Below this, the member wrote too little to publish without a look. */
const MIN_MEMBER_TEXT = 10;

const DIGIT_MAP: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٫": ".", "٬": ",",
};

function normaliseDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹٫٬]/g, (d) => DIGIT_MAP[d] ?? d);
}

/** Every number in a text, thousands separators removed: "141,006" → "141006". */
export function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of normaliseDigits(text).matchAll(/\d+(?:[.,]\d+)*/g)) {
    const raw = m[0];
    // "0.25" keeps its decimal point; "141,006" loses its separator.
    const n = /^\d{1,3}(,\d{3})+$/.test(raw) ? raw.replace(/,/g, "") : raw.replace(/,/g, ".");
    // Canonical form, so "09" matches "9" and "4.50" matches "4.5".
    const value = Number(n);
    out.add(Number.isFinite(value) ? String(value) : n);
  }
  return out;
}

/** Everything the contribution knows, as one searchable text. */
export function sourceCorpus(c: Contribution): string {
  const e = c.evaluation;
  return [
    c.title,
    c.url,
    c.description,
    c.memberReason,
    c.note,
    e?.aiSummary,
    e?.aiInterpretation,
    e?.classification.reason,
    e?.audience.reason,
    e?.extracted.title,
    e?.extracted.entity,
    e?.extracted.source,
    e?.extracted.practicalValue,
    e?.verification.originalDate,
    ...(e?.extracted.keyPoints ?? []),
    ...(e?.extracted.capabilities ?? []),
    ...(e?.verification.evidence ?? []),
    ...(e?.difficulty.prerequisites ?? []),
  ]
    .filter(Boolean)
    .join("\n");
}

function writtenText(item: NewsletterItem): string {
  return [
    item.title,
    item.headline,
    item.kicker,
    ...item.paragraphs,
    item.whyItMatters,
    item.chip,
    item.fitText,
    item.idea,
    item.example,
    item.note,
    item.moral,
    item.byline,
    item.source.name,
    item.source.linkText,
    ...item.prerequisites,
  ].join("\n");
}

function allowedUrls(c: Contribution): string[] {
  const e = c.evaluation;
  return [
    c.url,
    e?.verification.resolvedSource,
    e?.extracted.sourceUrl,
    ...(e?.extracted.links ?? []),
  ].filter((u): u is string => Boolean(u));
}

function mostlyLatin(text: string): boolean {
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const arabic = (text.match(/[؀-ۿ]/g) ?? []).length;
  return latin > 40 && latin > arabic;
}

export function validateItem(
  item: NewsletterItem,
  contribution: Contribution | null,
  sectionId: SectionId,
): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  const warn = (code: string, message: string) =>
    flags.push({ code, severity: "warning", message });
  const info = (code: string, message: string) =>
    flags.push({ code, severity: "info", message });

  if (!contribution) {
    warn(
      "missing_contribution",
      "المساهمة الأصلية لم تعد متاحة، فلا يمكن التحقق من هذا العنصر.",
    );
    return flags;
  }

  const def = sectionById(sectionId);
  const e = contribution.evaluation;

  // Numbers are where invention hides: benchmarks, prices, dates, counts.
  const known = numbersIn(sourceCorpus(contribution));
  const unknown = [...numbersIn(writtenText(item))].filter((n) => !known.has(n));
  if (unknown.length > 0) {
    warn(
      "unsupported_number",
      `أرقام لا توجد في بيانات المصدر: ${unknown.slice(0, 6).join("، ")}. تحقق منها أو احذفها.`,
    );
  }

  // Links are never written by the model, but an editor can change them.
  if (!allowedUrls(contribution).some((u) => sameResource(u, item.source.url))) {
    warn(
      "url_changed",
      "الرابط لا يطابق رابط المساهمة ولا المصدر الذي تحقق منه رصد.",
    );
  }

  if (!item.title.trim()) warn("missing_title", "العنصر بلا عنوان.");
  if (item.paragraphs.every((p) => !p.trim())) {
    warn("missing_body", "لا يوجد نص يشرح العنصر.");
  }
  const why = item.whyItMatters.trim();
  if (!why) {
    warn("missing_why", "لا يوجد «لماذا يهمك؟»، والعضو لم يكتب نصًا.");
  } else if (why.length < MIN_MEMBER_TEXT) {
    // Printed as it is, either way. The flag is for the editor, and flags
    // never reach the published page.
    warn(
      "short_member_text",
      `نص العضو قصير جدًا (${why.length} حرفًا). يظهر في النشرة كما كتبه، فراجعه يدويًا قبل النشر.`,
    );
  }

  if (e?.verification.status === "not_independently_verified") {
    warn(
      "unverified_source",
      "لم يُتحقق من المصدر بشكل مستقل. تأكد منه قبل النشر.",
    );
  } else if (e?.verification.status === "partially_verified") {
    info("partially_verified", "تحقق جزئي فقط من المصدر.");
  }

  if (!item.source.publishedAt) {
    info("missing_date", "تاريخ النشر الأصلي غير معروف.");
  }

  // "Do not present an old tool as new."
  if (
    (sectionId === "new_tools" || sectionId === "models") &&
    item.source.publishedAt &&
    daysBetween(item.source.publishedAt, new Date()) > NEWSLETTER.staleForNewDays
  ) {
    warn(
      "not_new",
      `نُشر قبل أكثر من ${NEWSLETTER.staleForNewDays} يومًا، قد لا يصح تقديمه كجديد.`,
    );
  }

  if (def.kind === "learn" && !item.difficulty) {
    info("missing_level", "مستوى الصعوبة غير محدد.");
  }
  if (def.kind === "tool" && !item.chip.trim() && !item.fitText.trim()) {
    info("missing_audience", "لم يُحدد لمن تناسب هذه الأداة.");
  }

  if (mostlyLatin(item.paragraphs.join(" "))) {
    warn("needs_arabic", "النص بالإنجليزية ويحتاج صياغة عربية.");
  }

  if (item.writtenBy === "source") {
    info(
      "assembled_from_source",
      "النص مجمّع مباشرة من بيانات المساهمة دون صياغة، راجع الأسلوب.",
    );
  }

  for (const noteText of item.aiNotes) {
    warn("ai_note", noteText);
  }

  return flags;
}

export function validateIssue(
  issue: NewsletterIssue,
  byId: Map<string, Contribution>,
): NewsletterIssue {
  return {
    ...issue,
    sections: issue.sections.map((s) => ({
      ...s,
      items: s.items.map((item) => ({
        ...item,
        flags: validateItem(item, byId.get(item.contributionId) ?? null, s.id),
      })),
    })),
  };
}

export function openWarnings(issue: NewsletterIssue): number {
  return issue.sections.reduce(
    (sum, s) =>
      sum +
      s.items.reduce(
        (n, i) => n + i.flags.filter((f) => f.severity === "warning").length,
        0,
      ),
    0,
  );
}
