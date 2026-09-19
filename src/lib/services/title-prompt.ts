import { hostname, truncate } from "@/lib/util/text";
import type { SourceSnapshot } from "./fetch-source";

/**
 * The wording that names a pasted link, shared by every provider so the
 * composer reads the same whichever model is behind it.
 */
export const TITLE_SYSTEM_PROMPT = `You label submissions for "Rased", an internal knowledge-sharing game for a small AI team.

A member pasted a link. Read the page metadata you are given and produce:
1. title — the headline of the thing itself, in Modern Standard Arabic, 4 to 12 words. Say what happened or what the thing is (e.g. "أنثروبيك تطلق Claude Opus 5", "كيرسر يضيف عملاء خلفية"). Keep product/company/model names in their original Latin spelling inside the Arabic sentence. Strip site names, taglines, "| TechCrunch" suffixes, clickbait framing and marketing adjectives. Never invent facts that are not in the metadata; if the page is thin, describe it plainly from what is there.
2. summary — one neutral sentence in Modern Standard Arabic (max 25 words) saying what this is and why an AI team would look at it.

Answer with the JSON object only.`;

export const TITLE_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
  },
  required: ["title", "summary"],
  additionalProperties: false,
};

export function buildTitlePrompt(
  snapshot: SourceSnapshot,
  url: string,
  note: string,
): string {
  const lines = [
    `URL: ${snapshot.finalUrl ?? url}`,
    `Domain: ${snapshot.domain || hostname(url)}`,
    `Page title: ${snapshot.pageTitle ?? "(none)"}`,
    `Meta description: ${snapshot.metaDescription ?? "(none)"}`,
    `Published date found on the page: ${snapshot.publishedDate ?? "(none)"}`,
  ];
  if (!snapshot.ok) {
    lines.push(
      `NOTE: the page could not be read (${snapshot.error ?? "unknown error"}). Work from the URL alone.`,
    );
  }
  if (snapshot.excerpt) {
    lines.push("", "Page text (truncated):", truncate(snapshot.excerpt, 2500));
  }
  if (note.trim()) {
    lines.push(
      "",
      `What the member said about it (context only, do not copy their wording): ${truncate(note.trim(), 500)}`,
    );
  }
  return lines.join("\n");
}

/** Drops the "… | Site Name" tail sites append, and trims to a sane length. */
export function cleanTitle(raw: string): string {
  let value = raw.replace(/\s+/g, " ").trim();
  if (!value) return "";

  const parts = value.split(/\s+[|·–—]\s+/);
  if (parts.length > 1) {
    const head = parts[0].trim();
    // Only drop the tail when the head still carries the meaning.
    if (head.length >= 20) value = head;
  }
  return truncate(value, 160);
}
