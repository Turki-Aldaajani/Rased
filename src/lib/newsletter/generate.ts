import Anthropic from "@anthropic-ai/sdk";
import type { Contribution } from "@/lib/db/schema";
import { hostname, truncate } from "@/lib/util/text";
import { composeFromSource } from "./compose";
import { sectionById, type SectionDef, type SectionId } from "./sections";
import type { NewsletterItem } from "./types";
import { sourceCorpus } from "./validate";

/**
 * Pipeline step 6, write the selected items.
 *
 * The model returns structured JSON, never HTML, and only ever writes prose.
 * Links, contributors, audiences, difficulty and editorial scores come from
 * the contribution and cannot be changed by the model.
 */

const MODEL = process.env.RASED_MODEL || "claude-opus-5";
const EFFORT = (process.env.RASED_NEWSLETTER_EFFORT ||
  process.env.RASED_EFFORT ||
  "medium") as "low" | "medium" | "high" | "xhigh" | "max";

export function newsletterAiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export interface SectionWrite {
  items: NewsletterItem[];
  engine: "ai" | "source";
  error: string | null;
}

const SYSTEM_PROMPT = `You are the editor of "نشرة الذكاء الاصطناعي", the AI newsletter of the Enjaz Club AI Team, read by university students interested in AI.

Team members submitted these items and explained why they matter. Your job is to write each selected item for the newsletter, in the voice of the existing issues: concise, useful, clear, practical, technically accurate, and written for a student who may not know advanced terms yet. It should read like a curated student newsletter, not a corporate press release and not generic AI hype.

Hard rules, in order of importance:
1. Write only what the provided source data supports. Never add a number, price, percentage, benchmark result, date, release detail, capability, feature, comparison, statistic, company announcement or social-media reaction that is not in the data. If a field would need something the data does not contain, leave it as an empty string.
2. If something important is missing or unclear, say so in that item's needsReview list (in Arabic) instead of guessing.
3. Do not write "why it matters" at all. That line is the member's own text and is printed word for word; it is given to you only as context for the rest of the item.
4. No marketing language, no exaggeration, no "revolutionary" or "game-changing". Popularity is not importance.
5. Write in clear Modern Standard Arabic. Keep product, company and model names in their original Latin spelling. Explain technical terms the first time they appear.
6. Never use an em dash (—). Use a comma, or start a new sentence.

Tone reference, from Issue #1:
"الاتجاه هنا أهم من اسم النموذج نفسه: الذكاء الاصطناعي ينتقل تدريجيًا من نموذج ينتظر تعليماتك إلى وكيل يستطيع تنفيذ سلسلة كاملة من المهام نيابةً عنك."

Return one entry per input item, with the same "ref".`;

const SECTION_GUIDE: Record<SectionId, string> = {
  top_news: `Section: أهم الأخبار (important AI news).
- title: a short headline for the card.
- headline: one line (at most ~15 words) for the numbered summary list at the top of the section.
- paragraphs: 2–3 short paragraphs, what happened, what is notable about it, and the context a student needs.
- Leave chip, fitText, idea, example, note, moral, platform, byline empty.`,
  models: `Section: جديد النماذج (new AI models).
- title: model name and what it is, e.g. "GPT-Live-1 للمحادثات الصوتية داخل الـAPI".
- paragraphs: 2–3 short paragraphs covering the model, the organisation behind it, its main capabilities and notable improvements, supported modalities and availability, only where the data states them. No benchmark comparisons unless the data gives them.
- headline: one line. Leave chip, fitText, idea, example, note, moral, platform, byline empty.`,
  new_tools: `Section: أدوات جديدة (genuinely new tools).
- title: the tool's name only.
- paragraphs: 1–2 short paragraphs, what it does, how it is used.
- chip: who it is for, in the form "للمطورين" / "للجميع" / "للطلبة والمطورين".
- fitText: who benefits, as a short list separated by " · ".
- idea: one sentence answering "why should I care about this tool?".
- example: a concrete use only if the data supports one; otherwise empty.
- Leave moral, platform, byline empty.`,
  other_tools: `Section: أدوات أخرى (useful tools that are not new). Never describe the tool as new.
- title: the tool's name only.
- paragraphs: 1–2 short paragraphs, the practical use and who benefits.
- chip: who it is for, e.g. "للمصممين وصناع المحتوى".
- fitText: who benefits, separated by " · ".
- example: a practical workflow or use case, only if the data supports it; otherwise empty.
- note: an optional extra practical tip from the data; otherwise empty.
- Leave idea, moral, platform, byline empty.`,
  learn: `Section: تعلّم هذا الأسبوع (learning).
- title: the topic or resource name.
- paragraphs: 1–3 short paragraphs that explain the concept plainly, for a reader who does not know the advanced terms yet.
- example: a quick example only if the data supports it; otherwise empty.
- note: one line on why this is worth learning now.
- fitText: who this suits, e.g. "من بدأ يسمع عن AI Agents".
- byline: the author or organisation if the data names one; otherwise empty.
- Leave chip, idea, moral, platform empty.`,
  social: `Section: رائج على السوشال (social media trends). Do not sensationalise; popularity is not importance.
- title: what is trending, in a few words.
- paragraphs: 1 paragraph, what is being discussed, where, and why people are talking about it.
- moral: the takeaway, whether there is practical value or a lesson, without the "المغزى:" prefix.
- platform: where it is trending (e.g. Reddit, X), only if the data shows it.
- Leave chip, fitText, idea, example, note, byline empty.`,
};

const ITEM_SCHEMA = {
  type: "object",
  properties: {
    ref: { type: "string" },
    title: { type: "string" },
    headline: { type: "string" },
    paragraphs: { type: "array", items: { type: "string" } },
    chip: { type: "string" },
    fitText: { type: "string" },
    idea: { type: "string" },
    example: { type: "string" },
    note: { type: "string" },
    moral: { type: "string" },
    platform: { type: "string" },
    byline: { type: "string" },
    needsReview: { type: "array", items: { type: "string" } },
  },
  required: [
    "ref",
    "title",
    "headline",
    "paragraphs",
    "chip",
    "fitText",
    "idea",
    "example",
    "note",
    "moral",
    "platform",
    "byline",
    "needsReview",
  ],
  additionalProperties: false,
} as const;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    items: { type: "array", items: ITEM_SCHEMA },
  },
  required: ["items"],
  additionalProperties: false,
};

interface WrittenItem {
  ref: string;
  title: string;
  headline: string;
  paragraphs: string[];
  chip: string;
  fitText: string;
  idea: string;
  example: string;
  note: string;
  moral: string;
  platform: string;
  byline: string;
  needsReview: string[];
}

/** What the model is allowed to read about one item. No points, no scores. */
function sourcePayload(c: Contribution, ref: string) {
  const e = c.evaluation;
  return {
    ref,
    title: c.title,
    source_site: hostname(c.url),
    source_name: e?.extracted.source ?? null,
    organisation: e?.extracted.entity ?? null,
    publication_date: e?.verification.originalDate ?? null,
    verification: e?.verification.status ?? "not_independently_verified",
    summary: e?.aiSummary ?? c.description,
    key_points: e?.extracted.keyPoints ?? [],
    capabilities: e?.extracted.capabilities ?? [],
    practical_value: e?.extracted.practicalValue ?? null,
    audience: e?.audience.tags ?? [],
    difficulty: e?.difficulty.level ?? "not_applicable",
    prerequisites: e?.difficulty.prerequisites ?? [],
    member_reason: c.memberReason,
    member_note: c.note || null,
    reading_of_member_reason: e?.aiInterpretation || null,
  };
}

/** The house style has no em dashes in it, so neither does anything written. */
function noEmDash(s: string): string {
  return s
    .replace(/\s*—\s*/g, "، ")
    .replace(/،\s*،/g, "،")
    .replace(/،\s*([.!?؟])/g, "$1")
    .replace(/^[،\s]+|[،\s]+$/g, "");
}

function clean(s: unknown, max = 1200): string {
  return truncate(noEmDash(String(s ?? "").trim()), max);
}

/**
 * Names are only taken from the model when the source already contains them,
 * so a plausible-looking author or platform cannot be made up.
 */
function supported(value: string, corpus: string): boolean {
  return Boolean(value) && corpus.toLowerCase().includes(value.toLowerCase());
}

function merge(
  skeleton: NewsletterItem,
  written: WrittenItem | undefined,
  contribution: Contribution,
): NewsletterItem {
  if (!written) {
    return {
      ...skeleton,
      aiNotes: ["لم يكتب المحرر الآلي هذا العنصر، والنص مجمّع من بيانات المساهمة."],
    };
  }
  const corpus = sourceCorpus(contribution);
  const paragraphs = (written.paragraphs ?? []).map((p) => clean(p)).filter(Boolean);
  const byline = clean(written.byline, 120);
  const platform = clean(written.platform, 60);

  return {
    ...skeleton,
    title: clean(written.title, 200) || skeleton.title,
    headline: clean(written.headline, 240) || skeleton.headline,
    paragraphs: paragraphs.length > 0 ? paragraphs.slice(0, 4) : skeleton.paragraphs,
    // Never the model's: "لماذا يهمك؟" is the member's own text, printed as
    // they wrote it. See composeFromSource.
    whyItMatters: contribution.memberReason,
    chip: clean(written.chip, 80) || skeleton.chip,
    fitText: clean(written.fitText, 300) || skeleton.fitText,
    idea: clean(written.idea, 500),
    example: clean(written.example, 800),
    note: clean(written.note, 500),
    moral: clean(written.moral, 400).replace(/^المغزى\s*[:：]\s*/, ""),
    platform: supported(platform, corpus) ? platform : skeleton.platform,
    byline: supported(byline, corpus) ? byline : skeleton.byline,
    writtenBy: "ai",
    aiNotes: (written.needsReview ?? []).map((n) => clean(n, 300)).filter(Boolean),
  };
}

export async function writeSection(
  sectionId: SectionId,
  contributions: Contribution[],
): Promise<SectionWrite> {
  const def = sectionById(sectionId);
  const skeletons = contributions.map((c) => composeFromSource(c, sectionId));

  if (contributions.length === 0) {
    return { items: [], engine: "source", error: null };
  }
  if (!newsletterAiEnabled()) {
    return { items: skeletons, engine: "source", error: null };
  }

  try {
    const written = await callModel(def, contributions);
    const byRef = new Map(written.map((w) => [w.ref, w]));
    return {
      items: contributions.map((c, i) => merge(skeletons[i], byRef.get(c.id), c)),
      engine: "ai",
      error: null,
    };
  } catch (err) {
    // §29: a failed run never loses anything. The caller decides whether to
    // keep the previous text or fall back to these source-built items.
    return {
      items: skeletons,
      engine: "source",
      error: `تعذّرت كتابة قسم «${def.title}» بالذكاء الاصطناعي: ${truncate(
        (err as Error)?.message ?? "خطأ غير معروف",
        240,
      )}`,
    };
  }
}

async function callModel(
  def: SectionDef,
  contributions: Contribution[],
): Promise<WrittenItem[]> {
  const client = new Anthropic();
  const payload = contributions.map((c) => sourcePayload(c, c.id));

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    // Refused requests are re-run on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: {
      effort: EFFORT,
      format: { type: "json_schema", schema: OUTPUT_SCHEMA },
    },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `${SECTION_GUIDE[def.id]}\n\nItems, strongest first (keep this order):\n${JSON.stringify(payload, null, 2)}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("رفض النموذج كتابة هذا القسم.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("انقطع الرد قبل اكتماله.");
  }

  const raw = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  if (!raw) throw new Error("لم يُرجع النموذج أي محتوى.");

  const parsed = JSON.parse(raw) as { items?: WrittenItem[] };
  if (!Array.isArray(parsed.items)) {
    throw new Error("الرد لا يطابق البنية المطلوبة.");
  }
  return parsed.items;
}
