import { DIFFICULTIES, type Difficulty } from "@/lib/db/schema";
import { truncate } from "@/lib/util/text";
import { sectionById, type SectionId } from "./sections";
import type { NewsletterItem } from "./types";

/**
 * How an edit is applied to one stored item, shared by the host's editor and
 * the reviewers' page so both go through the same limits and rules.
 */

type Json = Record<string, unknown>;

export const str = (v: unknown, max: number) => truncate(String(v ?? "").trim(), max);
const list = (v: unknown, max: number, each: number) =>
  (Array.isArray(v) ? v : [])
    .map((x) => str(x, each))
    .filter(Boolean)
    .slice(0, max);

export const TEXT_FIELDS: [keyof NewsletterItem, number][] = [
  ["title", 200],
  ["headline", 240],
  ["kicker", 60],
  ["whyItMatters", 800],
  ["chip", 80],
  ["fitLabel", 30],
  ["fitText", 300],
  ["ideaLabel", 40],
  ["idea", 500],
  ["exampleLabel", 40],
  ["example", 800],
  ["note", 500],
  ["moral", 400],
  ["platform", 60],
  ["byline", 120],
  ["levelLabel", 40],
  ["ctaLabel", 60],
];

/**
 * Applies an editor's version of an item on top of the stored one. Only
 * editable fields are read; everything that traces the item back to its
 * contribution is kept from the stored copy.
 */
export function applyItemEdit(stored: NewsletterItem, input: Json, sectionId: SectionId): NewsletterItem {
  const next: NewsletterItem = { ...stored };
  let changed = false;
  const set = <K extends keyof NewsletterItem>(key: K, value: NewsletterItem[K]) => {
    if (JSON.stringify(stored[key]) !== JSON.stringify(value)) changed = true;
    next[key] = value;
  };

  for (const [key, max] of TEXT_FIELDS) {
    if (key in input) set(key, str(input[key], max) as never);
  }
  if ("paragraphs" in input) set("paragraphs", list(input.paragraphs, 6, 1500));
  if ("prerequisites" in input) set("prerequisites", list(input.prerequisites, 6, 120));
  if ("aiNotes" in input) {
    // Editors can clear the model's notes once they have checked them, not add new ones.
    const keep = list(input.aiNotes, 20, 300).filter((n) => stored.aiNotes.includes(n));
    next.aiNotes = keep;
  }
  if ("difficulty" in input) {
    const d = String(input.difficulty ?? "");
    set(
      "difficulty",
      DIFFICULTIES.includes(d as Difficulty) && d !== "not_applicable"
        ? (d as Difficulty)
        : null,
    );
  }
  if (input.source && typeof input.source === "object") {
    const s = input.source as Json;
    set("source", {
      ...stored.source,
      name: "name" in s ? str(s.name, 120) : stored.source.name,
      url: "url" in s ? str(s.url, 1000) : stored.source.url,
      linkText: "linkText" in s ? str(s.linkText, 200) : stored.source.linkText,
    });
  }

  next.category = sectionById(sectionId).category;
  if (changed) next.writtenBy = "editor";
  return next;
}
