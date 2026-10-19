import type { ReviewerRole } from "@/lib/db/schema";
import { SECTIONS, sectionById, type SectionId, type SectionKind } from "@/lib/newsletter/sections";
import type { NewsletterIssue, NewsletterItem } from "@/lib/newsletter/types";

/**
 * The three review tasks, what each one sees and what each one may change.
 * The server reads this table on every request; the page only mirrors it.
 */

/** A field a reviewer may change. "source.url" is the card's link. */
export type ReviewField = "whyItMatters" | "moral" | "note" | "fitText" | "idea" | "source.url";

export interface RoleDef {
  role: ReviewerRole;
  label: string;
  /** In the host's one-line review trail, e.g. "راجعه: أحمد (ما وراء الخبر)". */
  short: string;
  /** Shown at the top of the reviewer's page. */
  task: string;
  sections: readonly SectionId[];
  /** Editable fields per card family. A family missing here is read-only. */
  fields: Partial<Record<SectionKind, readonly ReviewField[]>>;
}

const ALL_KINDS: SectionKind[] = ["story", "tool", "learn", "social"];

export const ROLES: Record<ReviewerRole, RoleDef> = {
  insight: {
    role: "insight",
    label: "مراجع «ما وراء الخبر»",
    short: "ما وراء الخبر",
    task:
      "راجع نص «ما وراء الخبر بزاوية راصد» في كل بطاقة: أن يكون واضحًا، وبطول مناسب، ومتسقًا مع بقية العدد.",
    sections: ["models", "top_news", "learn", "social"],
    fields: {
      story: ["whyItMatters"],
      learn: ["note", "fitText"],
      social: ["moral"],
    },
  },
  tools: {
    role: "tools",
    label: "مراجع الأدوات",
    short: "الأدوات",
    task: "راجع «مناسب لـ» و«الفكرة» في بطاقات الأدوات: لمن تفيد الأداة فعلًا، وكيف يستخدمها القارئ.",
    sections: ["new_tools", "other_tools"],
    fields: { tool: ["fitText", "idea"] },
  },
  content: {
    role: "content",
    label: "مدقق المحتوى",
    short: "تدقيق المحتوى",
    task:
      "تأكد أن رابط كل بطاقة مرتبط فعلًا بالخبر، وأن الخبر حديث (آخر أسبوعين). صحّح الرابط إن لزم، ثم احكم: حديث أو غير حديث.",
    sections: SECTIONS.map((s) => s.id),
    fields: Object.fromEntries(ALL_KINDS.map((k) => [k, ["source.url"]])),
  },
};

/**
 * «ما وراء الخبر» against the news, in words (see hint.ts). Below `long` × the
 * news is fine; from `long` it is longer than preferred; from `longer` it is as
 * long as the news or longer. A field whose content words sit in the news more
 * than `repeat` of the time is restating it, judged only once it has
 * `minRepeatWords` content words, so a two-word line is not called a repeat.
 */
export const INSIGHT_HINT = {
  long: 0.5,
  longer: 1.0,
  repeat: 0.7,
  minRepeatWords: 4,
} as const;

/** Shown under the task to the roles that write «ما وراء الخبر». */
export const INSIGHT_RULE =
  "«ما وراء الخبر» يلخّص ولا يكرر: اجعله أقصر وأبسط من نص الخبر، وأضف ما لا يقوله الخبر صراحةً.";

/**
 * A standing note under a field, for what the field should say beyond being
 * short. Shown to whoever may edit that field on that card family.
 */
const FIELD_GUIDES: Partial<Record<SectionKind, Partial<Record<ReviewField, string>>>> = {
  tool: {
    idea: "اجعل «الفكرة» طريقة استخدام قدر المستطاع: كيف يستخدم القارئ هذه الأداة، لا ما تفعله فقط.",
  },
};

export function fieldGuide(sectionId: SectionId, field: ReviewField): string | null {
  return FIELD_GUIDES[sectionById(sectionId).kind]?.[field] ?? null;
}

export function writesInsight(role: ReviewerRole): boolean {
  return role === "insight" || role === "tools";
}

export const FIELD_LABELS: Record<ReviewField, string> = {
  whyItMatters: "لماذا يهمك؟",
  moral: "المغزى",
  note: "الملاحظة الختامية",
  fitText: "مناسب لـ",
  idea: "الفكرة",
  "source.url": "رابط المصدر",
};

/** Longest value each field takes, the same limits as the host's editor. */
export const FIELD_MAX: Record<ReviewField, number> = {
  whyItMatters: 800,
  moral: 400,
  note: 500,
  fitText: 300,
  idea: 500,
  "source.url": 1000,
};

export function roleSees(role: ReviewerRole, sectionId: SectionId): boolean {
  return ROLES[role].sections.includes(sectionId);
}

/** What this role may change on a card of this section; empty when it may not see it. */
export function editableFields(role: ReviewerRole, sectionId: SectionId): readonly ReviewField[] {
  if (!roleSees(role, sectionId)) return [];
  return ROLES[role].fields[sectionById(sectionId).kind] ?? [];
}

export function fieldValue(item: NewsletterItem, field: ReviewField): string {
  return field === "source.url" ? item.source.url : item[field];
}

export interface RoleProgress {
  role: ReviewerRole;
  label: string;
  total: number;
  reviewed: number;
}

/** For the host: how many of each role's cards have been through that role. */
export function reviewProgress(issue: NewsletterIssue): RoleProgress[] {
  return (Object.keys(ROLES) as ReviewerRole[]).map((role) => {
    const items = issue.sections
      .filter((s) => roleSees(role, s.id))
      .flatMap((s) => s.items);
    return {
      role,
      label: ROLES[role].label,
      total: items.length,
      reviewed: items.filter((i) => i.review?.by[role]).length,
    };
  });
}
