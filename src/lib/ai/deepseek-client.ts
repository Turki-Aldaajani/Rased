import type { SourceSnapshot } from "@/lib/services/fetch-source";
import type { DuplicateCandidate } from "@/lib/services/duplicates";
import type { SearchHit } from "@/lib/services/web-search";
import {
  buildUserPrompt,
  EVALUATION_TOOL,
  SYSTEM_PROMPT,
  type EvaluationInput,
  type EvaluationToolInput,
} from "@/lib/services/prompt";
import {
  TITLE_SYSTEM_PROMPT,
  buildTitlePrompt,
  cleanTitle,
} from "@/lib/services/title-prompt";
import { truncate } from "@/lib/util/text";
import { fetchReadableContent } from "./fetch-content";
import type { AIClient, LabelResult } from "./types";

/**
 * DeepSeek, through its OpenAI-compatible chat endpoint.
 *
 * The important difference from the Claude path: DeepSeek has no server-side
 * browsing. It receives text and answers about that text, so the app opens the
 * link itself (`fetch-content.ts`) and pastes the page in. Anything a plain
 * fetch cannot read, a PDF, a page drawn by JavaScript, is refused here with
 * a reason the member can act on, rather than being sent to the model as an
 * empty page for it to guess about.
 *
 * It also has no tool-calling turn in this path: the same schema the Claude
 * tool uses is given to it as JSON Schema and the answer comes back in JSON
 * mode, so what reaches `buildEvaluation` is the identical object.
 */

const ENDPOINT =
  process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const TIMEOUT_MS = 120_000;

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function chat(
  messages: ChatMessage[],
  maxTokens: number,
): Promise<string> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("لم يُضبط DEEPSEEK_API_KEY.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ENDPOINT}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        // JSON mode. DeepSeek requires the word "json" somewhere in the
        // prompt for this to be accepted; both prompts below say it.
        response_format: { type: "json_object" },
        max_tokens: maxTokens,
        temperature: 0.2,
        stream: false,
      }),
    });

    if (!res.ok) {
      const detail = truncate((await res.text().catch(() => "")).trim(), 300);
      throw new Error(
        `استجاب DeepSeek بـ HTTP ${res.status}${detail ? `، ${detail}` : ""}`,
      );
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
    };
    const choice = data.choices?.[0];
    const content = choice?.message?.content?.trim() ?? "";
    if (!content) throw new Error("أعاد DeepSeek ردًا فارغًا.");
    if (choice?.finish_reason === "length") {
      throw new Error("انقطع رد DeepSeek قبل اكتماله (تجاوز حد الطول).");
    }
    return content;
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      throw new Error(`انتهت مهلة الاتصال بـ DeepSeek بعد ${TIMEOUT_MS / 1000} ثانية.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** JSON mode still occasionally wraps the object in a ```json fence. */
function parseJsonObject(raw: string): Record<string, unknown> {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? raw).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  const candidate = start >= 0 && end > start ? body.slice(start, end + 1) : body;

  const parsed = JSON.parse(candidate) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("لم يُعِد DeepSeek كائن JSON.");
  }
  return parsed as Record<string, unknown>;
}

async function evaluate(
  input: EvaluationInput,
  snapshot: SourceSnapshot,
  candidates: DuplicateCandidate[],
  hits: SearchHit[],
): Promise<EvaluationToolInput> {
  const content = await fetchReadableContent(input.url, snapshot);
  if (!content.ok) {
    // Surfaced to the member as the pending reason, so they see a sentence
    // that tells them what to do instead of a generic failure.
    throw new Error(content.error ?? "تعذّرت قراءة محتوى الرابط.");
  }

  const schema = JSON.stringify(EVALUATION_TOOL.input_schema);
  const system = [
    SYSTEM_PROMPT,
    "",
    "## Output",
    "You have no browsing tools in this deployment. The page text below is everything you get, the server fetched it for you. Judge only from it, the member's own words and the earlier submissions listed. Never claim a check you could not perform: if you could not confirm a claim independently, set verificationStatus to \"not_independently_verified\" and say so in the evidence.",
    "",
    "Answer with a single json object and nothing else, no prose, no markdown fence. It must validate against this JSON Schema:",
    schema,
  ].join("\n");

  const user = [
    buildUserPrompt(input, snapshot, candidates, hits),
    "",
    "## Full page text the server read for you",
    "---",
    content.text,
    "---",
    "",
    "Now answer with the json object described in the schema.",
  ].join("\n");

  const raw = await chat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    8000,
  );

  // Every field is coerced downstream in `buildEvaluation`, which is what the
  // Claude tool output goes through too, a missing or odd field degrades the
  // same way for both providers instead of throwing here.
  return parseJsonObject(raw) as unknown as EvaluationToolInput;
}

async function label(
  snapshot: SourceSnapshot,
  url: string,
  note: string,
): Promise<LabelResult | null> {
  const content = await fetchReadableContent(url, snapshot);

  const user = [
    buildTitlePrompt(snapshot, url, note),
    ...(content.ok
      ? ["", "Page text the server read for you:", truncate(content.text, 4000)]
      : [
          "",
          `NOTE: the page body could not be read (${content.error}). Work from the metadata above alone.`,
        ]),
    "",
    'Answer with a json object: {"title": "...", "summary": "..."}',
  ].join("\n");

  const raw = await chat(
    [
      { role: "system", content: TITLE_SYSTEM_PROMPT },
      { role: "user", content: user },
    ],
    1000,
  );

  const parsed = parseJsonObject(raw) as { title?: string; summary?: string };
  const title = cleanTitle(parsed.title ?? "");
  if (!title) return null;

  return { title, summary: truncate((parsed.summary ?? "").trim(), 240) };
}

export const deepseekClient: AIClient = {
  name: "deepseek",
  model: MODEL,
  canBrowse: false,
  enabled: () => Boolean(process.env.DEEPSEEK_API_KEY),
  label,
  evaluate,
};
