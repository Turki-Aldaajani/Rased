import { randomUUID } from "crypto";
import {
  effectiveCategory,
  editorialScore,
  type Audience,
  type Contribution,
  type Difficulty,
} from "@/lib/db/schema";
import { hostname } from "@/lib/util/text";
import { sectionById, type SectionId } from "./sections";
import type { NewsletterItem } from "./types";

/**
 * Builds an item straight from a contribution's stored data.
 *
 * This is both the skeleton the AI writes into and the fallback when there is
 * no AI: every sentence here already exists in the contribution, so nothing
 * is invented. The wording is rough, which is why every such item is flagged
 * for an editor.
 */

/** Audience as Issue #1 names it, in the form that follows "لـ". */
const AUDIENCE_AR: Record<Audience, string> = {
  beginners: "المبتدئين",
  university_students: "الطلبة",
  developers: "المطورين",
  ai_engineers: "مهندسي الذكاء الاصطناعي",
  data_scientists: "علماء البيانات",
  researchers: "الباحثين",
  designers: "المصممين",
  entrepreneurs: "رواد الأعمال",
  content_creators: "صناع المحتوى",
  general_users: "الجميع",
};

/** "لـ" fused onto the noun, the way Issue #1 writes its chips: "للمطورين". */
function withLam(noun: string): string {
  return noun.startsWith("ال") ? `ل${noun.slice(1)}` : `ل${noun}`;
}

export function audienceChip(tags: Audience[]): string {
  const names = tags
    .filter((t) => t !== "general_users" || tags.length === 1)
    .slice(0, 2)
    .map((t) => AUDIENCE_AR[t]);
  if (names.length === 0) return "";
  return withLam(names.join(" و"));
}

export function audienceFit(tags: Audience[]): string {
  return tags.map((t) => AUDIENCE_AR[t]).join(" · ");
}

export function levelLabel(
  difficulty: Difficulty | null,
  c: Contribution,
): string {
  if (difficulty === "beginner") return "مبتدئ";
  if (difficulty === "intermediate") return "متوسط";
  if (difficulty === "advanced") {
    const research =
      c.evaluation?.audience.tags.includes("researchers") ||
      /arxiv|openreview|doi\.org|papers/i.test(c.url);
    return research ? "بحث علمي" : "متقدم";
  }
  return "";
}

const PLATFORMS: [RegExp, string][] = [
  [/(^|\.)reddit\.com$/, "Reddit"],
  [/(^|\.)(x|twitter)\.com$/, "X"],
  [/(^|\.)linkedin\.com$/, "LinkedIn"],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, "YouTube"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)threads\.net$/, "Threads"],
  [/(^|\.)news\.ycombinator\.com$/, "Hacker News"],
];

export function platformName(url: string): string {
  const host = hostname(url);
  for (const [re, name] of PLATFORMS) if (re.test(host)) return name;
  return host;
}

function distinctTexts(list: (string | null | undefined)[], max: number): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const t = (raw ?? "").trim();
    if (!t) continue;
    if (out.some((o) => o.includes(t) || t.includes(o))) continue;
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

export function composeFromSource(
  c: Contribution,
  sectionId: SectionId,
): NewsletterItem {
  const def = sectionById(sectionId);
  const e = c.evaluation;
  const audience = e?.audience.tags ?? [];
  const difficulty =
    e && e.difficulty.level !== "not_applicable" ? e.difficulty.level : null;

  const body =
    def.kind === "story"
      ? distinctTexts([e?.aiSummary, ...(e?.extracted.keyPoints ?? []), ...(e?.extracted.capabilities ?? [])], 3)
      : distinctTexts([e?.aiSummary, ...(e?.extracted.keyPoints ?? [])], 2);

  return {
    id: randomUUID(),
    contributionId: c.id,
    title: c.title,
    headline: c.title,
    kicker: sectionId === "top_news" ? "الخبر الأهم" : "",
    paragraphs: body.length > 0 ? body : [c.description].filter(Boolean),
    // The member's own text, verbatim. This is what the newsletter prints:
    // no model rewrites it, in this path or the AI one.
    whyItMatters: c.memberReason,
    chip: def.kind === "tool" ? audienceChip(audience) : "",
    fitLabel: def.defaults.fitLabel,
    fitText: def.kind === "tool" || def.kind === "learn" ? audienceFit(audience) : "",
    ideaLabel: def.defaults.ideaLabel,
    idea: def.kind === "tool" ? (e?.extracted.practicalValue ?? "") : "",
    exampleLabel: def.defaults.exampleLabel,
    example: "",
    note: "",
    moral: def.kind === "social" ? (e?.extracted.practicalValue ?? "") : "",
    platform: def.kind === "social" ? platformName(c.url) : "",
    byline: def.kind === "learn" ? (e?.extracted.entity ?? "") : "",
    levelLabel: def.kind === "learn" ? levelLabel(difficulty, c) : "",
    difficulty,
    prerequisites: def.kind === "learn" ? (e?.difficulty.prerequisites ?? []) : [],
    audience,
    ctaLabel: def.defaults.ctaLabel,
    source: {
      name: e?.extracted.entity || e?.extracted.source || hostname(c.url),
      url: c.url,
      linkText: "",
      publishedAt: e?.verification.originalDate ?? null,
    },
    contributor: { memberId: c.memberId, memberName: c.memberName },
    category: effectiveCategory(c) ?? def.category,
    editorialScore: editorialScore(c),
    writtenBy: "source",
    aiNotes: [],
    flags: [],
  };
}
