import { NEWSLETTER } from "@/lib/config/rules";
import type { NewsletterCategory } from "@/lib/db/schema";

/**
 * The six sections of the newsletter, exactly as Issue #1 names and anchors
 * them. This file is the single source for those names: the app's category
 * labels read from here too, so the two can never drift apart.
 */

export const SECTION_IDS = [
  "top_news",
  "models",
  "new_tools",
  "other_tools",
  "learn",
  "social",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

/** Which card family from Issue #1 a section is drawn with. */
export type SectionKind = "story" | "tool" | "learn" | "social";

export interface SectionDef {
  id: SectionId;
  category: NewsletterCategory;
  /** HTML anchor used by Issue #1 (#top-news, #models, …). */
  anchor: string;
  /** Section title as printed in Issue #1. */
  title: string;
  kind: SectionKind;
  limit: number;
  /** Default wording, all lifted from Issue #1. */
  defaults: {
    ctaLabel: string;
    fitLabel: string;
    ideaLabel: string;
    exampleLabel: string;
  };
}

export const SECTIONS: readonly SectionDef[] = [
  {
    id: "top_news",
    category: "important_news",
    anchor: "top-news",
    title: "أهم الأخبار",
    kind: "story",
    limit: NEWSLETTER.sectionLimits.top_news,
    defaults: { ctaLabel: "", fitLabel: "", ideaLabel: "", exampleLabel: "" },
  },
  {
    id: "models",
    category: "new_models",
    anchor: "models",
    title: "جديد النماذج",
    kind: "story",
    limit: NEWSLETTER.sectionLimits.models,
    defaults: { ctaLabel: "", fitLabel: "", ideaLabel: "", exampleLabel: "" },
  },
  {
    id: "new_tools",
    category: "new_tools",
    anchor: "new-tools",
    title: "أدوات جديدة",
    kind: "tool",
    limit: NEWSLETTER.sectionLimits.new_tools,
    defaults: {
      ctaLabel: "جرّب الأداة",
      fitLabel: "مناسب لـ",
      ideaLabel: "الفكرة",
      exampleLabel: "مثال عملي",
    },
  },
  {
    id: "other_tools",
    category: "other_tools",
    anchor: "more-tools",
    title: "أدوات أخرى",
    kind: "tool",
    limit: NEWSLETTER.sectionLimits.other_tools,
    defaults: {
      ctaLabel: "افتح الأداة",
      fitLabel: "مفيد لـ",
      ideaLabel: "الفكرة",
      exampleLabel: "مثال عملي",
    },
  },
  {
    id: "learn",
    category: "learn_this_week",
    anchor: "learn",
    title: "تعلّم هذا الأسبوع",
    kind: "learn",
    limit: NEWSLETTER.sectionLimits.learn,
    defaults: {
      ctaLabel: "اقرأ أو شاهد",
      fitLabel: "مناسب لـ",
      ideaLabel: "الفكرة",
      exampleLabel: "مثال سريع",
    },
  },
  {
    id: "social",
    category: "social_trends",
    anchor: "social",
    title: "رائج على السوشال",
    kind: "social",
    limit: NEWSLETTER.sectionLimits.social,
    defaults: { ctaLabel: "", fitLabel: "", ideaLabel: "", exampleLabel: "" },
  },
];

export function sectionById(id: SectionId): SectionDef {
  const def = SECTIONS.find((s) => s.id === id);
  if (!def) throw new Error(`Unknown section: ${id}`);
  return def;
}

export function sectionForCategory(category: NewsletterCategory): SectionDef {
  const def = SECTIONS.find((s) => s.category === category);
  if (!def) throw new Error(`No section for category: ${category}`);
  return def;
}

export function isSectionId(value: unknown): value is SectionId {
  return SECTION_IDS.includes(value as SectionId);
}

/** Category → the section title Issue #1 prints for it. */
export const SECTION_TITLE_BY_CATEGORY = Object.fromEntries(
  SECTIONS.map((s) => [s.category, s.title]),
) as Record<NewsletterCategory, string>;
