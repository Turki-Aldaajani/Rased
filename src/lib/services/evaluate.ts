import Anthropic from "@anthropic-ai/sdk";
import { SCORING } from "@/lib/config/scoring";
import type { Contribution, Evaluation } from "@/lib/db/schema";
import { fetchSource, type SourceSnapshot } from "./fetch-source";
import { findDuplicateCandidates, type DuplicateCandidate } from "./duplicates";
import { configuredProvider, providerIsInline, webSearch } from "./web-search";
import {
  clampBreakdown,
  computeFinalScore,
  recencyLabel,
  recencyPoints,
} from "./scoring";
import {
  buildUserPrompt,
  EVALUATION_TOOL,
  SYSTEM_PROMPT,
  type EvaluationInput,
  type EvaluationToolInput,
} from "./prompt";
import { hostname, meaningfulWordCount, truncate } from "@/lib/util/text";

export interface EvaluationResult {
  evaluation: Evaluation;
  snapshot: SourceSnapshot;
  candidates: DuplicateCandidate[];
  /** Non-fatal problems worth showing the user (e.g. AI unavailable). */
  notices: string[];
}

const MODEL = process.env.AI_HUNT_MODEL || "claude-opus-5";
const EFFORT = (process.env.AI_HUNT_EFFORT || "medium") as
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Full pipeline: read the source, look for prior submissions covering the same
 * thing, verify + evaluate, then compute the final score deterministically.
 */
export async function evaluateContribution(
  input: EvaluationInput,
  existing: Contribution[],
): Promise<EvaluationResult> {
  const notices: string[] = [];

  const [snapshot, hits] = await Promise.all([
    fetchSource(input.url),
    providerIsInline(configuredProvider())
      ? Promise.resolve([])
      : webSearch(`${input.title} ${hostname(input.url)}`.trim()),
  ]);

  const candidates = findDuplicateCandidates(input, existing);

  if (aiEnabled()) {
    try {
      const evaluation = await evaluateWithAi(
        input,
        snapshot,
        candidates,
        hits,
      );
      return { evaluation, snapshot, candidates, notices };
    } catch (err) {
      notices.push(
        `تعذّر الوصول إلى مقيّم الذكاء الاصطناعي (${truncate(
          (err as Error)?.message ?? "خطأ غير معروف",
          160,
        )}). تم اللجوء إلى التقييم غير المتصل.`,
      );
    }
  } else {
    notices.push(
      "وضع غير متصل: لم يُضبط ANTHROPIC_API_KEY، فتم التقييم بالخوارزمية المدمجة بدلًا من مقيّم الذكاء الاصطناعي.",
    );
  }

  return {
    evaluation: evaluateHeuristically(input, snapshot, candidates),
    snapshot,
    candidates,
    notices,
  };
}

// ---------------------------------------------------------------------------
// AI evaluator
// ---------------------------------------------------------------------------

function serverTools(): Anthropic.ToolUnion[] {
  if (!providerIsInline(configuredProvider())) return [];
  return [
    { type: "web_search_20260209", name: "web_search", max_uses: 6 },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: 4 },
  ] as Anthropic.ToolUnion[];
}

async function evaluateWithAi(
  input: EvaluationInput,
  snapshot: SourceSnapshot,
  candidates: DuplicateCandidate[],
  hits: Awaited<ReturnType<typeof webSearch>>,
): Promise<Evaluation> {
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
        "Now call the submit_evaluation tool with your final scores. Do not reply with plain text.",
    });
  }

  if (!toolInput) {
    throw new Error("لم يُعِد المقيّم نتيجة منظَّمة.");
  }

  return buildEvaluation(toolInput, candidates, "ai", MODEL);
}

function buildEvaluation(
  t: EvaluationToolInput,
  candidates: DuplicateCandidate[],
  engine: "ai" | "heuristic",
  model: string | null,
): Evaluation {
  const originalDate =
    t.originalDate && t.originalDate !== "unknown" ? t.originalDate : null;

  // Recency is recomputed from the resolved date so it is always consistent
  // with the configured bands, whatever the model guessed.
  const breakdown = clampBreakdown({
    importance: t.importance,
    recency: recencyPoints(originalDate),
    usefulness: t.usefulness,
    relevance: t.relevance,
    sourceReliability: t.sourceReliability,
    personalContribution: t.personalContribution,
  });

  const duplicate = t.duplicateStatus;
  const dupTarget =
    duplicate !== "original" &&
    t.duplicateOfIndex >= 0 &&
    t.duplicateOfIndex < candidates.length
      ? candidates[t.duplicateOfIndex].contribution
      : null;

  const { rawScore, finalScore, penalties } = computeFinalScore(
    breakdown,
    t.verified,
    duplicate,
  );

  const evidence = Array.isArray(t.evidence)
    ? t.evidence.filter(Boolean).map((e) => truncate(String(e), 300))
    : [];
  evidence.push(recencyLabel(originalDate));
  evidence.push(...penalties);

  return {
    verified: t.verified,
    originalDate,
    resolvedSource:
      t.resolvedSource && t.resolvedSource !== "unknown"
        ? t.resolvedSource
        : null,
    duplicate,
    duplicateOfId: dupTarget?.id ?? null,
    duplicateReason: t.duplicateReason || null,
    breakdown,
    rawScore,
    finalScore,
    reason: t.reason,
    evidence,
    engine,
    model,
  };
}

// ---------------------------------------------------------------------------
// Offline heuristic fallback — keeps the whole flow testable with no API key
// ---------------------------------------------------------------------------

const HIGH_IMPACT = [
  "gpt", "claude", "gemini", "llama", "mistral", "grok", "qwen", "deepseek",
  "model", "release", "launch", "multimodal", "reasoning", "agent", "sora",
  "breakthrough", "state-of-the-art", "sota", "benchmark", "open-source",
  "open source", "api", "capability",
];

const LOW_IMPACT = ["rumor", "rumour", "opinion", "listicle", "top 10", "roundup"];

function domainTier(domain: string): "trusted" | "reputable" | "unknown" {
  const d = domain.toLowerCase();
  const match = (list: readonly string[]) =>
    list.some((t) => d === t || d.endsWith(`.${t}`));
  if (match(SCORING.trustedDomains)) return "trusted";
  if (match(SCORING.reputableDomains)) return "reputable";
  return "unknown";
}

function evaluateHeuristically(
  input: EvaluationInput,
  snapshot: SourceSnapshot,
  candidates: DuplicateCandidate[],
): Evaluation {
  const max = SCORING.maxPoints;
  const haystack =
    `${input.title} ${input.description} ${snapshot.pageTitle ?? ""} ${snapshot.metaDescription ?? ""}`.toLowerCase();

  // Importance — keyword signal, nudged by how much the page corroborates it.
  const highHits = HIGH_IMPACT.filter((k) => haystack.includes(k)).length;
  const lowHits = LOW_IMPACT.filter((k) => haystack.includes(k)).length;
  let importance = 10 + Math.min(highHits * 2.5, 12) - lowHits * 4;
  if (!snapshot.ok) importance -= 3;

  // Source reliability — domain reputation, minus points if unreachable.
  const tier = domainTier(snapshot.domain);
  let sourceReliability =
    tier === "trusted" ? max.sourceReliability : tier === "reputable" ? 7 : 4;
  if (!snapshot.ok) sourceReliability = Math.min(sourceReliability, 3);

  // Recency — from whatever date the page exposed.
  const originalDate = normaliseDate(snapshot.publishedDate);
  const recency = recencyPoints(originalDate);

  // Usefulness — type and keyword driven, with a small bonus for docs/tools.
  const typeBonus: Record<string, number> = {
    "AI Tool": 4,
    "Learning Resource": 3,
    "AI Use Case": 3,
    "Research / Paper": 2,
    Project: 2,
    "AI News": 1,
    Other: 0,
  };
  let usefulness = 10 + (typeBonus[input.type] ?? 0);
  if (/tutorial|guide|docs|how to|dataset|open source|free/.test(haystack)) {
    usefulness += 3;
  }

  // Relevance — does it actually look like AI content?
  const aiSignal = /\b(ai|llm|model|neural|machine learning|ml|agent|prompt|transformer|gpt|diffusion)\b/.test(
    haystack,
  );
  const relevance = aiSignal ? 12 : 5;

  // Personal contribution — specificity beats length.
  const why = input.whyUseful || "";
  const words = meaningfulWordCount(why);
  let personal = 0;
  if (words >= 5) personal = 3;
  if (words >= 15) personal = 5;
  if (/\b(i |we )?(tested|tried|used|ran|built|compared|measured)\b/i.test(why)) {
    personal += 3;
  }
  if (/\b(project|dataset|assignment|course|team|workflow|pipeline)\b/i.test(why)) {
    personal += 2;
  }
  if (words < 4) personal = Math.min(personal, 1);

  const breakdown = clampBreakdown({
    importance,
    recency,
    usefulness,
    relevance,
    sourceReliability,
    personalContribution: personal,
  });

  // Duplicate — purely local similarity in offline mode.
  const top = candidates[0];
  let duplicate: Evaluation["duplicate"] = "original";
  let duplicateReason = "لم يُرسل شيء مشابه من قبل.";
  if (top && (top.sameUrl || top.score >= SCORING.duplicateSimilarityThreshold)) {
    const addsMore = meaningfulWordCount(why) >= 15 && !top.sameUrl;
    duplicate = addsMore ? "partial" : "duplicate";
    duplicateReason = `تطابق ${Math.round(top.score * 100)}٪ مع "${truncate(
      top.contribution.title,
      70,
    )}" الذي أرسله ${top.contribution.memberName}${
      top.sameUrl ? " (نفس الرابط)" : ""
    }.${addsMore ? " هذه المساهمة تضيف ملاحظة شخصية أطول، لذا حصلت على تقييم جزئي." : ""}`;
  }

  const verified: Evaluation["verified"] = snapshot.ok
    ? snapshot.publishedDate
      ? "verified"
      : "partial"
    : "unverified";

  const { rawScore, finalScore, penalties } = computeFinalScore(
    breakdown,
    verified,
    duplicate,
  );

  const evidence: string[] = [];
  evidence.push(
    snapshot.ok
      ? `تم فتح ${snapshot.domain} بنجاح (HTTP ${snapshot.status}).`
      : `تعذّر فتح المصدر: ${snapshot.error}`,
  );
  if (snapshot.pageTitle) {
    evidence.push(`عنوان الصفحة: "${truncate(snapshot.pageTitle, 120)}".`);
  }
  evidence.push(
    tier === "trusted"
      ? `${snapshot.domain} ضمن قائمة المصادر الرسمية الموثوقة.`
      : tier === "reputable"
        ? `${snapshot.domain} تغطية تقنية موثوقة، وليس المصدر الأساسي.`
        : `${snapshot.domain || "النطاق"} ليس مصدرًا رسميًا معروفًا.`,
  );
  evidence.push(recencyLabel(originalDate));
  evidence.push(...penalties);

  return {
    verified,
    originalDate,
    resolvedSource: snapshot.finalUrl,
    duplicate,
    duplicateOfId:
      duplicate === "original" ? null : (top?.contribution.id ?? null),
    duplicateReason,
    breakdown,
    rawScore,
    finalScore,
    reason: buildHeuristicReason(breakdown, verified, duplicate, tier),
    evidence,
    engine: "heuristic",
    model: null,
  };
}

function buildHeuristicReason(
  b: Evaluation["breakdown"],
  verified: Evaluation["verified"],
  duplicate: Evaluation["duplicate"],
  tier: string,
): string {
  const bits: string[] = [];
  bits.push(
    b.importance >= 18
      ? "يبدو تطورًا مهمًا في الذكاء الاصطناعي."
      : b.importance >= 11
        ? "عنصر مفيد لكنه غير رئيسي في الذكاء الاصطناعي."
        : "أهمية محدودة بالنسبة للفريق.",
  );
  bits.push(
    verified === "verified"
      ? `فُتح المصدر بلا مشاكل وهو ${tier === "trusted" ? "مصدر رسمي" : "مصدر يمكن قراءته"}.`
      : verified === "partial"
        ? "تم تحميل الصفحة لكن تعذّر تأكيد تاريخ النشر."
        : "تعذّر فتح المصدر، لذا لم يُؤكَّد الادعاء.",
  );
  if (duplicate !== "original") {
    bits.push("يتداخل مع مساهمة سابقة، لذا خُفّضت النقاط.");
  }
  bits.push(
    b.personalContribution >= 6
      ? "أضاف العضو سببًا محددًا وواضحًا لأهميته."
      : "يمكن أن تكون الملاحظة الشخصية أكثر تحديدًا للحصول على تقييم أعلى.",
  );
  return bits.join(" ");
}

function normaliseDate(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
