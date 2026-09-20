import Anthropic from "@anthropic-ai/sdk";
import type { SourceSnapshot } from "@/lib/services/fetch-source";
import type { DuplicateCandidate } from "@/lib/services/duplicates";
import type { SearchHit } from "@/lib/services/web-search";
import {
  configuredProvider,
  providerIsInline,
} from "@/lib/services/web-search";
import {
  buildUserPrompt,
  EVALUATION_TOOL,
  SYSTEM_PROMPT,
  type EvaluationInput,
  type EvaluationToolInput,
} from "@/lib/services/prompt";
import {
  TITLE_SYSTEM_PROMPT,
  TITLE_OUTPUT_SCHEMA,
  buildTitlePrompt,
  cleanTitle,
} from "@/lib/services/title-prompt";
import { truncate } from "@/lib/util/text";
import type { AIClient, LabelResult } from "./types";

/**
 * The Claude path, unchanged: it reads the web itself through the server-side
 * web_search/web_fetch tools and answers by calling the evaluation tool.
 * This is the default provider, nothing here depends on AI_PROVIDER.
 */

const MODEL = process.env.RASED_MODEL || "claude-opus-5";
const TITLE_MODEL = process.env.RASED_TITLE_MODEL || "claude-opus-5";
const EFFORT = (process.env.RASED_EFFORT || "medium") as
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

function serverTools(): Anthropic.ToolUnion[] {
  if (!providerIsInline(configuredProvider())) return [];
  return [
    { type: "web_search_20260209", name: "web_search", max_uses: 6 },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: 4 },
  ] as Anthropic.ToolUnion[];
}

async function evaluate(
  input: EvaluationInput,
  snapshot: SourceSnapshot,
  candidates: DuplicateCandidate[],
  hits: SearchHit[],
): Promise<EvaluationToolInput> {
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildUserPrompt(input, snapshot, candidates, hits) },
  ];

  let toolInput: EvaluationToolInput | null = null;

  // Server tools resolve inside the request, so this normally runs once.
  // The extra turns exist for pause_turn and for nudging a missing tool call.
  for (let turn = 0; turn < 4 && !toolInput; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      thinking: { type: "adaptive" },
      output_config: { effort: EFFORT },
      tools: [...serverTools(), EVALUATION_TOOL as Anthropic.ToolUnion],
      tool_choice: { type: "auto" },
      messages,
    });

    for (const block of response.content) {
      if (block.type === "tool_use" && block.name === EVALUATION_TOOL.name) {
        toolInput = block.input as EvaluationToolInput;
      }
    }
    if (toolInput) break;

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "pause_turn") continue;
    if (response.stop_reason === "refusal") {
      throw new Error("رفض المقيّم تقييم هذه المساهمة.");
    }
    messages.push({
      role: "user",
      content:
        "Now call the submit_evaluation tool with your final evaluation. Do not reply with plain text.",
    });
  }

  if (!toolInput) {
    throw new Error("لم يُعِد المقيّم نتيجة منظَّمة.");
  }

  return toolInput;
}

async function label(
  snapshot: SourceSnapshot,
  url: string,
  note: string,
): Promise<LabelResult | null> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: TITLE_MODEL,
    max_tokens: 4000,
    system: TITLE_SYSTEM_PROMPT,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: TITLE_OUTPUT_SCHEMA },
    },
    messages: [{ role: "user", content: buildTitlePrompt(snapshot, url, note) }],
  });

  if (response.stop_reason === "refusal") return null;

  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!raw) return null;

  const parsed = JSON.parse(raw) as { title?: string; summary?: string };
  const title = cleanTitle(parsed.title ?? "");
  if (!title) return null;

  return { title, summary: truncate((parsed.summary ?? "").trim(), 240) };
}

export const claudeClient: AIClient = {
  name: "claude",
  model: MODEL,
  canBrowse: true,
  enabled: () => Boolean(process.env.ANTHROPIC_API_KEY),
  label,
  evaluate,
};
