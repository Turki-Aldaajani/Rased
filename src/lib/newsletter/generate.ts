import Anthropic from "@anthropic-ai/sdk";
import { DEEPSEEK_MODEL, deepseekChat, parseJsonObject } from "@/lib/ai/deepseek-client";
import { configuredAIProvider, providerKeyName } from "@/lib/ai/provider";
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
 *
 * AI_PROVIDER picks the writer, the same switch the evaluation uses: Claude
 * gets the schema as structured output, DeepSeek gets it in JSON mode. Either
 * way the answer goes through `coerceWritten` before anything reads it.
 */

const MODEL = process.env.RASED_MODEL || "claude-opus-5";
const EFFORT = (process.env.RASED_NEWSLETTER_EFFORT ||
  process.env.RASED_EFFORT ||
  "medium") as "low" | "medium" | "high" | "xhigh" | "max";

export function newsletterAiEnabled(): boolean {
  return Boolean(process.env[providerKeyName(configuredAIProvider())]);
}

/** The model that writes the newsletter, as recorded on the issue. */
export function newsletterModel(): string {
  return configuredAIProvider() === "deepseek" ? DEEPSEEK_MODEL : MODEL;
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
3. "why" is the line printed under «لماذا يهمك؟» (ما وراء الخبر بزاوية راصد). Its only source is member_reason, the member's own words:
   - Condense member_reason, never add to it: no new fact, no new number, no conclusion of your own. If member_reason is already short and good, return it unchanged.
   - One or two sentences, at most about 40 words.
   - Answer the reader's question «وش يعني لي هذا؟»: the effect, who it suits, or what the reader can do. Do not repeat what the body already says: not the date, not the benchmark result, not the announcement.
   - No lists of numbers. If one number is the point itself (e.g. «أكثر من 50%»), keep that one number only.
   - If member_reason is empty, leave "why" empty.
4. Every sentence of the body adds new information. Never restate something already said in the title or an earlier paragraph, even in different words.
   - The first paragraph answers: who announced it, what it is, and where it is available. Later paragraphs are for details only.
   - key_points and capabilities are raw material, not ready paragraphs. Fold what matters into your own sentences; never copy them as separate sentences, and never turn each one into its own paragraph.
   - Of the numeric details (benchmarks, percentages, scores), pick the 2 or 3 that matter most. Never list them all.
5. No marketing language, no exaggeration, no "revolutionary" or "game-changing". Popularity is not importance.
6. Write in clear Modern Standard Arabic. Keep product, company and model names in their original Latin spelling. Explain technical terms the first time they appear.
7. Never use an em dash (—). Use a comma, or start a new sentence.

Tone reference, from Issue #1:
"الاتجاه هنا أهم من اسم النموذج نفسه: الذكاء الاصطناعي ينتقل تدريجيًا من نموذج ينتظر تعليماتك إلى وكيل يستطيع تنفيذ سلسلة كاملة من المهام نيابةً عنك."

Reference cards from Issue #3. The body states the facts; «لماذا يهمك؟» turns them into a decision for the reader and does not repeat them.

Good, Claude Haiku 5.5:
body: "أطلقت Anthropic نموذج Claude Haiku 5.5 بوصفه أصغر نموذج وأسرعه وأقلّه تكلفة، موجّهًا للمهام عالية الحجم مثل التلخيص والتصنيف. وتقول الشركة إن تكلفة تشغيله أقل بنحو 75% من Haiku 4.5."
why: "لو شغلك مهام متكررة وكثيرة مثل التلخيص والتصنيف، هذا النموذج يخفّض تكلفتها بدون ما تدفع ثمن نموذج أكبر. جرّب على شغلك الخفيف، وخلي النماذج الأقوى للمهام الأصعب."
(The why gives a practical decision and does not repeat the 75%.)

Good, EmbeddingGemma 2:
body: "أعلنت Google عن EmbeddingGemma 2، وهو نموذج تضمين متعدد الوسائط خفيف الوزن يوحّد النصوص والصور والفيديو والصوت في فضاء تضمين واحد. يبلغ حجمه 740 مليون معامل، ويدعم أبعادًا مرنة بين 768 و128 عبر MRL ونافذة سياق 8K."
why: "لو تشتغل على تطبيق فيه أكثر من نوع محتوى، تقدر تستخدم نموذج واحد لكلها بدل نموذج لكل نوع. وحجمه الخفيف يخليك تشغّله على جهازك مباشرة."
(The body is technical; the why translates it into a use.)

Good, المغزى for a Reddit post about open-source alternatives to Adobe apps built with AI agents:
moral: "الذكاء الاصطناعي خفّض تكلفة البداية، لكنه لم يخفّض تكلفة الإتقان. أي ادعاء بأن أداة جديدة تعوّض برنامجًا راسخًا لا يُحكم عليه من عرض مرئي، بل بتجربته على مهمة حقيقية من عملك."
(A general lesson the reader can apply, not a summary of the post.)

Bad, avoid this. Gemini 4 Carbon:
paragraph 1: "أعلنت Google DeepMind عن Gemini 4 Carbon، وهو نموذج حدودي جديد وصفته بأقوى نماذجها في الأمن السيبراني والمهام طويلة الأفق. تصدّر النموذج مؤشر Artificial Analysis Intelligence Index v5.0 بنتيجة 59."
paragraph 2: "أعلنت Google عن Gemini 4 Carbon كنموذجها الحدودي الأقوى مع قدرات متقدمة في الأمن السيبراني والمهام طويلة الأفق."
paragraph 3: "حلّ النموذج أولًا في مؤشر Artificial Analysis Intelligence Index v5.0 بنتيجة 59."
why: about 100 words listing the date, the index score 59 and five more benchmark numbers, ending with the only real angle.
(Paragraphs 2 and 3 repeat paragraph 1. The why repeats the body and lists numbers.) The why should have been the angle alone:
"حين يستطيع نموذج استغلال أكثر من نصف الثغرات المختبرة، يصبح تحديد من يحصل عليه أولًا قرارًا أمنيًا لا تسويقيًا."

Return one entry per input item, with the same "ref".`;

const SECTION_GUIDE: Record<SectionId, string> = {
  top_news: `Section: أبرز الأخبار (important AI news).
- title: a short headline for the card.
- headline: one line (at most ~15 words) for the numbered summary list at the top of the section.
- paragraphs: 1–2 short paragraphs (3 only when there really are three different things to say): what happened, what is notable about it, and the context a student needs.
- why: the member's reason, condensed (rule 3).
- Leave chip, fitText, idea, example, note, moral, platform, byline empty.`,
  models: `Section: جديد النماذج (new AI models).
- title: model name and what it is, e.g. "GPT-Live-1 للمحادثات الصوتية داخل الـAPI".
- paragraphs: 1–2 short paragraphs (3 only when there really are three different things to say) covering the model, the organisation behind it, its main capabilities and notable improvements, supported modalities and availability, only where the data states them. No benchmark comparisons unless the data gives them, and then only the 2 or 3 that matter most.
- why: the member's reason, condensed (rule 3).
- headline: one line. Leave chip, fitText, idea, example, note, moral, platform, byline empty.`,
  new_tools: `Section: أدوات جديدة (genuinely new tools).
- title: the tool's name only.
- paragraphs: 1 short paragraph: what it does, how it is used.
- chip: who it is for, in the form "للمطورين" / "للجميع" / "للطلبة والمطورين".
- fitText: who benefits, as a short list separated by " · ".
- idea: one sentence answering "why should I care about this tool?".
- example: a concrete use only if the data supports one; otherwise empty.
- Leave why, moral, platform, byline empty.`,
  other_tools: `Section: أدوات أخرى (useful tools that are not new). Never describe the tool as new.
- title: the tool's name only.
- paragraphs: 1 short paragraph: the practical use and who benefits.
- chip: who it is for, e.g. "للمصممين وصناع المحتوى".
- fitText: who benefits, separated by " · ".
- example: a practical workflow or use case, only if the data supports it; otherwise empty.
- note: an optional extra practical tip from the data; otherwise empty.
- Leave why, idea, moral, platform, byline empty.`,
  learn: `Section: تعلّم هذا الأسبوع (learning).
- title: the topic or resource name.
- paragraphs: 1–3 short paragraphs that explain the concept plainly, for a reader who does not know the advanced terms yet.
- example: a quick example only if the data supports it; otherwise empty.
- note: one line on why this is worth learning now.
- fitText: who this suits, e.g. "من بدأ يسمع عن AI Agents".
- byline: the author or organisation if the data names one; otherwise empty.
- Leave why, chip, idea, moral, platform empty.`,
  social: `Section: رائج على السوشال (social media trends). Do not sensationalise; popularity is not importance.
- title: what is trending, in a few words.
- paragraphs: 1 paragraph, what is being discussed, where, and why people are talking about it.
- moral: the takeaway, a general lesson the reader can apply rather than a summary of the post, without the "المغزى:" prefix. Built from member_reason by the same rules as "why" (rule 3), at most about 50 words.
- platform: where it is trending (e.g. Reddit, X), only if the data shows it.
- Leave why, chip, fitText, idea, example, note, byline empty.`,
};

const ITEM_SCHEMA = {
  type: "object",
  properties: {
    ref: { type: "string" },
    title: { type: "string" },
    headline: { type: "string" },
    paragraphs: { type: "array", items: { type: "string" } },
    why: { type: "string" },
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
    "why",
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

export interface WrittenItem {
  ref: string;
  title: string;
  headline: string;
  paragraphs: string[];
  why: string;
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

export function merge(
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
    // The member's text condensed, never added to; validate.ts flags any
    // number the member did not write. Empty means the member's text as is,
    // and the original stays on the item for the editor either way.
    whyItMatters: clean(written.why, 800) || contribution.memberReason,
    memberReason: contribution.memberReason,
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

const TEXT_KEYS = [
  "title",
  "headline",
  "why",
  "chip",
  "fitText",
  "idea",
  "example",
  "note",
  "moral",
  "platform",
  "byline",
] as const;

function text(v: unknown): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

function texts(v: unknown): string[] {
  return Array.isArray(v) ? v.map(text).filter(Boolean) : [];
}

/**
 * The model's answer as trusted shape. JSON mode does not hold DeepSeek to
 * the schema, so a missing field reads as empty, an item for a ref that was
 * not asked about is dropped, and a ref answered twice keeps its first entry.
 */
export function coerceWritten(parsed: unknown, refs: string[]): WrittenItem[] {
  const items = (parsed as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) throw new Error("الرد لا يطابق البنية المطلوبة.");

  const wanted = new Set(refs);
  const out: WrittenItem[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const ref = text(r.ref).trim();
    if (!wanted.has(ref)) continue;
    wanted.delete(ref);
    const item = { ref, paragraphs: texts(r.paragraphs), needsReview: texts(r.needsReview) } as WrittenItem;
    for (const key of TEXT_KEYS) item[key] = text(r[key]);
    out.push(item);
  }
  return out;
}

async function callModel(
  def: SectionDef,
  contributions: Contribution[],
): Promise<WrittenItem[]> {
  const payload = contributions.map((c) => sourcePayload(c, c.id));
  const user = `${SECTION_GUIDE[def.id]}\n\nItems, strongest first (keep this order):\n${JSON.stringify(payload, null, 2)}`;
  const refs = contributions.map((c) => c.id);

  if (configuredAIProvider() === "deepseek") {
    return coerceWritten(parseJsonObject(await callDeepSeek(user)), refs);
  }
  return coerceWritten(JSON.parse(await callClaude(user)), refs);
}

async function callDeepSeek(user: string): Promise<string> {
  const system = [
    SYSTEM_PROMPT,
    "",
    "Answer with a single json object and nothing else, no prose, no markdown fence. It must validate against this JSON Schema:",
    JSON.stringify(OUTPUT_SCHEMA),
  ].join("\n");
  return deepseekChat(
    [
      { role: "system", content: system },
      { role: "user", content: `${user}\n\nNow answer with the json object described in the schema.` },
    ],
    // DeepSeek's chat model stops at 8K output tokens.
    8000,
  );
}

async function callClaude(user: string): Promise<string> {
  const client = new Anthropic();

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
        content: user,
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
  return raw;
}
