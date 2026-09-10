import Anthropic from "@anthropic-ai/sdk";
import {
  CONTRIBUTION_TYPES,
  type ContributionType,
} from "@/lib/db/schema";
import { hostname, truncate } from "@/lib/util/text";
import { fetchSource, type SourceSnapshot } from "./fetch-source";

export interface AutoLabel {
  title: string;
  type: ContributionType;
  /** One plain sentence describing what the link is, shown under the title. */
  summary: string;
  domain: string;
  /** "ai" when Claude wrote it, "heuristic" when it came from page metadata. */
  engine: "ai" | "heuristic";
}

const MODEL = process.env.RASED_TITLE_MODEL || "claude-opus-5";

const SYSTEM_PROMPT = `You label submissions for "Rased", an internal knowledge-sharing game for a small AI team.

A member pasted a link. Read the page metadata you are given and produce:
1. title — the headline of the thing itself, in Modern Standard Arabic, 4 to 12 words. Say what happened or what the thing is (e.g. "أنثروبيك تطلق Claude Opus 5", "كيرسر يضيف عملاء خلفية"). Keep product/company/model names in their original Latin spelling inside the Arabic sentence. Strip site names, taglines, "| TechCrunch" suffixes, clickbait framing and marketing adjectives. Never invent facts that are not in the metadata; if the page is thin, describe it plainly from what is there.
2. type — the single best fit from the allowed list (use the exact English value from the list).
3. summary — one neutral sentence in Modern Standard Arabic (max 25 words) saying what this is and why an AI team would look at it.

Answer with the JSON object only.`;

const OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    title: { type: "string" },
    type: { type: "string", enum: [...CONTRIBUTION_TYPES] },
    summary: { type: "string" },
  },
  required: ["title", "type", "summary"],
  additionalProperties: false,
};

function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Reads the pasted link and names it, so the member never types a title.
 * Never throws — a failure falls back to the page metadata, and past that to
 * the URL itself.
 */
export async function autoLabel(
  url: string,
  note = "",
  snapshotIn?: SourceSnapshot,
): Promise<AutoLabel> {
  const snapshot = snapshotIn ?? (await fetchSource(url));
  const fallback = labelFromMetadata(snapshot, url);

  if (!aiEnabled()) return fallback;

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      },
      messages: [{ role: "user", content: buildPrompt(snapshot, url, note) }],
    });

    if (response.stop_reason === "refusal") return fallback;

    const raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as {
      title?: string;
      type?: string;
      summary?: string;
    };
    const title = cleanTitle(parsed.title ?? "");
    if (!title) return fallback;

    return {
      title,
      type: coerceType(parsed.type) ?? fallback.type,
      summary: truncate((parsed.summary ?? "").trim(), 240) || fallback.summary,
      domain: fallback.domain,
      engine: "ai",
    };
  } catch {
    // Offline, rate-limited, bad JSON — the metadata title is good enough.
    return fallback;
  }
}

function buildPrompt(
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
  lines.push(
    "",
    `Allowed types: ${CONTRIBUTION_TYPES.join(", ")}`,
  );
  return lines.join("\n");
}

/** Best-effort naming with no AI: page metadata first, then the URL path. */
function labelFromMetadata(
  snapshot: SourceSnapshot,
  url: string,
): AutoLabel {
  const domain = snapshot.domain || hostname(url);
  const fromPage = cleanTitle(snapshot.pageTitle ?? "");
  const title = fromPage || titleFromUrl(url) || domain || "اكتشاف بلا عنوان";

  return {
    title,
    type: guessType(
      `${title} ${snapshot.metaDescription ?? ""} ${domain}`.toLowerCase(),
    ),
    summary: truncate((snapshot.metaDescription ?? "").trim(), 240),
    domain,
    engine: "heuristic",
  };
}

/** Drops the "… | Site Name" tail sites append, and trims to a sane length. */
function cleanTitle(raw: string): string {
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

function titleFromUrl(url: string): string {
  try {
    const { pathname } = new URL(url);
    const slug = pathname.split("/").filter(Boolean).pop() ?? "";
    const words = decodeURIComponent(slug)
      .replace(/\.(html?|php|aspx?|pdf)$/i, "")
      .replace(/[-_+]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (words.length < 3) return "";
    return truncate(words.charAt(0).toUpperCase() + words.slice(1), 160);
  } catch {
    return "";
  }
}

function coerceType(value: unknown): ContributionType | null {
  const match = CONTRIBUTION_TYPES.find(
    (t) => t.toLowerCase() === String(value ?? "").trim().toLowerCase(),
  );
  return match ?? null;
}

function guessType(haystack: string): ContributionType {
  if (/arxiv|paper|preprint|abstract|doi|proceedings/.test(haystack)) {
    return "Research / Paper";
  }
  if (/github\.com|npm|pypi|repo|library|sdk|cli|extension/.test(haystack)) {
    return "Project";
  }
  if (/docs?\.|tutorial|course|guide|handbook|learn|cookbook/.test(haystack)) {
    return "Learning Resource";
  }
  if (/pricing|product|launch|app|platform|tool|plugin/.test(haystack)) {
    return "AI Tool";
  }
  if (/case study|use case|deployed|in production/.test(haystack)) {
    return "AI Use Case";
  }
  return "AI News";
}
