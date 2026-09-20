import { ACCEPTANCE, DUPLICATES } from "@/lib/config/rules";
import {
  AUDIENCES,
  DIFFICULTIES,
  NEWSLETTER_CATEGORIES,
  type Audience,
  type Contribution,
  type ContributionStatus,
  type Difficulty,
  type DuplicateOutcome,
  type EligibilityChecks,
  type EvaluatedStatus,
  type Evaluation,
  type NewsletterCategory,
  type VerificationStatus,
} from "@/lib/db/schema";
import { fetchSource, type SourceSnapshot } from "./fetch-source";
import {
  candidateMatches,
  findDuplicateCandidates,
  type DuplicateCandidate,
} from "./duplicates";
import { configuredProvider, providerIsInline, webSearch } from "./web-search";
import { getAIClient, providerKeyName } from "@/lib/ai/provider";
import {
  computeEditorial,
  domainTier,
  recencyJudgement,
  recencyLabel,
  scaleBreakdown,
} from "./editorial";
import {
  type EvaluationInput,
  type EvaluationToolInput,
} from "./prompt";
import { hostname, meaningfulWordCount, truncate } from "@/lib/util/text";

export interface EvaluationOutcome {
  /**
   * null when there is nothing to store as an evaluation: the evaluator could
   * not be reached (the caller stores it pending) or the source blocked us
   * (`blocked`, stored for a host to review by hand).
   */
  evaluation: Evaluation | null;
  candidates: DuplicateCandidate[];
  /** Non-fatal things worth telling the member (e.g. offline mode). */
  notices: string[];
  /**
   * Why there is no evaluation. Retryable when `blocked` is false; when it is
   * true this is what the source answered, kept for the host.
   */
  error: string | null;
  /**
   * The source refused our automated read. No evaluator was consulted and a
   * retry would meet the same refusal, so only a human can settle it.
   */
  blocked: boolean;
}

/** True when the selected provider has the key it needs. */
export function aiEnabled(): boolean {
  return getAIClient().enabled();
}

/**
 * Full pipeline: read the source, find prior submissions covering the same
 * thing, evaluate, then derive the outcome deterministically.
 *
 * It never throws: an unreachable evaluator comes back as `error` so the
 * submission can be stored pending and retried instead of being lost.
 */
export async function evaluateContribution(
  input: EvaluationInput,
  existing: Contribution[],
): Promise<EvaluationOutcome> {
  const notices: string[] = [];
  const client = getAIClient();

  // The standalone search is skipped only when the model does the searching
  // itself. A provider that cannot browse always needs the separate pass.
  const searchIsInline =
    client.canBrowse && providerIsInline(configuredProvider());

  const [snapshot, hits] = await Promise.all([
    fetchSource(input.url),
    searchIsInline
      ? Promise.resolve([])
      : webSearch(`${input.title} ${hostname(input.url)}`.trim()),
  ]);

  // A source that refuses automated reads is settled by a person, not by a
  // model guessing from the member's own words. This runs before any provider
  // is consulted and does not depend on which one is configured.
  if (isBlockedSource(snapshot)) {
    return {
      evaluation: null,
      candidates: [],
      notices,
      error: snapshot.error ?? `استجاب المصدر بـ HTTP ${snapshot.status}.`,
      blocked: true,
    };
  }

  const candidates = findDuplicateCandidates(input, existing);

  if (client.enabled()) {
    try {
      const toolInput = await client.evaluate(input, snapshot, candidates, hits);
      const evaluation = buildEvaluation(
        toolInput,
        input,
        snapshot,
        candidates,
        "ai",
        client.model,
      );
      if (!client.canBrowse && hits.length === 0) {
        notices.push(
          `لا يملك ${client.model} تصفّحًا للإنترنت، فاعتمد التقييم على نص الصفحة وحده دون تحقق مستقل.`,
        );
      }
      return { evaluation, candidates, notices, error: null, blocked: false };
    } catch (err) {
      // §22: never lose the submission. The caller stores it pending.
      return {
        evaluation: null,
        candidates,
        notices,
        error: truncate(
          (err as Error)?.message ?? "خطأ غير معروف في المقيّم",
          300,
        ),
        blocked: false,
      };
    }
  }

  notices.push(
    `وضع غير متصل: لم يُضبط ${providerKeyName(client.name)}، فتم التقييم بالخوارزمية المدمجة. لم يجرِ أي تحقق مستقل من المصدر.`,
  );
  return {
    evaluation: evaluateHeuristically(input, snapshot, candidates),
    candidates,
    notices,
    error: null,
    blocked: false,
  };
}

// ---------------------------------------------------------------------------
// Deterministic outcome, the evaluator judges, the server decides
// ---------------------------------------------------------------------------

/**
 * Turns judgements into a status. The rules are in one place on purpose:
 * failing the acceptance floor rejects, a substantial duplicate is a duplicate,
 * a genuinely new angle on a known topic is a full contribution.
 */
export function deriveStatus(
  eligibility: EligibilityChecks,
  duplicate: DuplicateOutcome,
): EvaluatedStatus {
  const floorFailed = Object.entries(eligibility).some(
    // The duplicate criterion is handled by `duplicate`, not by a flag.
    ([, passed]) => !passed,
  );
  if (floorFailed) return "rejected";
  if (duplicate === "duplicate") return "duplicate";
  if (duplicate === "same_topic_new_value") return "accepted_with_new_angle";
  return "accepted";
}

/**
 * How much the source told us.
 *
 * "blocked" matters: plenty of official announcement pages refuse an unknown
 * user-agent. That says nothing about the member's contribution, so it must
 * not be treated the same as a dead link, we just cannot confirm anything.
 */
export type Reachability = "readable" | "blocked" | "broken";

const BLOCKING_STATUSES = [401, 402, 403, 405, 406, 409, 429, 451];

/**
 * The statuses that mean "the server refused us": credentials wanted, access
 * forbidden, our client not acceptable, rate-limited, blocked for legal
 * reasons. A 404 or 410 is not among them, that page really is gone, and it
 * keeps its own handling. 5xx and network failures stay out too: those are
 * the source being down, not the source turning us away.
 */
export const SOURCE_BLOCK_STATUSES = [401, 403, 406, 429, 451];

/** True when the source answered with a refusal to automated access. */
export function isBlockedSource(snapshot: SourceSnapshot): boolean {
  return (
    !snapshot.ok &&
    snapshot.status !== null &&
    SOURCE_BLOCK_STATUSES.includes(snapshot.status)
  );
}

export function reachability(snapshot: SourceSnapshot): Reachability {
  if (snapshot.ok) return "readable";
  if (snapshot.status === null) return "blocked"; // network error or timeout
  if (BLOCKING_STATUSES.includes(snapshot.status)) return "blocked";
  if (snapshot.status >= 500) return "blocked";
  return "broken"; // 404, 410 and friends: the page really is not there
}

/** Server-side floor checks that do not need an evaluator to decide. */
function localEligibility(
  input: EvaluationInput,
  snapshot: SourceSnapshot,
): Pick<EligibilityChecks, "usableSource" | "memberExplainedWhy"> {
  let validUrl = false;
  try {
    validUrl = /^https?:$/.test(new URL(input.url).protocol);
  } catch {
    validUrl = false;
  }
  return {
    usableSource:
      validUrl && Boolean(snapshot.domain) && reachability(snapshot) !== "broken",
    memberExplainedWhy:
      meaningfulWordCount(input.memberReason) >= ACCEPTANCE.minReasonWords,
  };
}

// ---------------------------------------------------------------------------
// Turning a provider's answer into an Evaluation
// ---------------------------------------------------------------------------

function buildEvaluation(
  t: EvaluationToolInput,
  input: EvaluationInput,
  snapshot: SourceSnapshot,
  candidates: DuplicateCandidate[],
  engine: "ai" | "heuristic",
  model: string | null,
): Evaluation {
  const originalDate = normaliseDate(
    t.originalDate && t.originalDate !== "unknown" ? t.originalDate : null,
  );

  // The server has the last word on the two checks it can make itself.
  const local = localEligibility(input, snapshot);
  const eligibility: EligibilityChecks = {
    aiRelated: Boolean(t.eligibility?.aiRelated),
    specificInformation: Boolean(t.eligibility?.specificInformation),
    usableSource: Boolean(t.eligibility?.usableSource) && local.usableSource,
    understandableFromSource: Boolean(t.eligibility?.understandableFromSource),
    memberExplainedWhy:
      Boolean(t.eligibility?.memberExplainedWhy) && local.memberExplainedWhy,
    usefulKnowledge: Boolean(t.eligibility?.usefulKnowledge),
  };

  const duplicateOutcome = coerceDuplicate(t.duplicateOutcome);
  const dupTarget =
    duplicateOutcome !== "unique" &&
    t.duplicateOfIndex >= 0 &&
    t.duplicateOfIndex < candidates.length
      ? candidates[t.duplicateOfIndex].contribution
      : null;

  const status = deriveStatus(eligibility, duplicateOutcome);

  const verification = coerceVerification(t.verificationStatus);

  // Recency is recomputed from the resolved date, so the editorial score is
  // always consistent with the configured bands whatever the model guessed.
  const breakdown = scaleBreakdown({
    ...(t.editorial ?? {}),
    recency: recencyJudgement(originalDate),
  });
  const editorial = computeEditorial(breakdown, verification, duplicateOutcome);
  editorial.notes.unshift(recencyLabel(originalDate));

  const primary = coerceCategory(t.primaryCategory) ?? "important_news";
  const secondary = (t.secondaryCategories ?? [])
    .map(coerceCategory)
    .filter((c): c is NewsletterCategory => Boolean(c) && c !== primary);

  const evidence = cleanList(t.evidence, 300, 6);
  if (verification === "not_independently_verified") {
    evidence.push("لم يجرِ تحقق مستقل من هذا الادعاء.");
  }

  return {
    status,
    rejectionReason:
      status === "rejected"
        ? t.rejectionReason?.trim() || describeFloorFailure(eligibility)
        : null,
    eligibility,
    classification: {
      primary,
      secondary: [...new Set(secondary)],
      reason: t.classificationReason?.trim() || "",
    },
    audience: {
      tags: cleanAudiences(t.audience),
      reason: t.audienceReason?.trim() || "",
    },
    difficulty: {
      level: coerceDifficulty(t.difficulty),
      prerequisites: cleanList(t.prerequisites, 120, 6),
    },
    duplicate: {
      outcome: duplicateOutcome,
      ofId: dupTarget?.id ?? null,
      confidence: clamp01(t.duplicateConfidence),
      reason: t.duplicateReason?.trim() || "",
      matches: candidateMatches(candidates),
    },
    verification: {
      status: verification,
      evidence,
      resolvedSource:
        t.resolvedSource && t.resolvedSource !== "unknown"
          ? t.resolvedSource
          : (snapshot.finalUrl ?? null),
      originalDate,
    },
    extracted: {
      title: snapshot.pageTitle ?? input.title ?? null,
      source: t.extractedSource?.trim() || snapshot.domain || null,
      sourceUrl: snapshot.finalUrl ?? input.url,
      publicationDate: originalDate,
      entity: t.extractedEntity?.trim() || null,
      keyPoints: cleanList(t.keyPoints, 300, 6),
      capabilities: cleanList(t.capabilities, 200, 6),
      practicalValue: t.practicalValue?.trim() || null,
      links: cleanList(t.usefulLinks, 300, 6),
    },
    aiInterpretation: t.aiInterpretation?.trim() || "",
    aiSummary: t.aiSummary?.trim() || "",
    editorial: {
      score: editorial.score,
      rawScore: editorial.rawScore,
      breakdown: editorial.breakdown,
      notes: editorial.notes,
    },
    summaryForMember:
      t.summaryForMember?.trim() || defaultSummary(status, duplicateOutcome),
    engine,
    model,
    evaluatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Offline heuristic, keeps the whole flow testable with no API key
// ---------------------------------------------------------------------------

/**
 * Arabic keywords live in their own patterns: JavaScript's \b is ASCII-only,
 * so an Arabic word wrapped in \b never matches, and an Arabic-language
 * submission would look like it had nothing to do with AI.
 */
const AI_SIGNAL_EN =
  /\b(ai|a\.i\.|llm|llms|gpt|claude|gemini|llama|mistral|qwen|deepseek|grok|model|models|neural|machine learning|deep learning|ml|agent|agents|prompt|transformer|diffusion|embedding|rag|fine-?tun|dataset|inference)\b/i;

const AI_SIGNAL_AR =
  /(ذكاء اصطناعي|الذكاء الاصطناعي|نموذج|نماذج|تعلم آلي|تعلّم آلي|تعلم عميق|شبكة عصبية|وكيل ذكي|وكلاء|تضمين|استدلال|بيانات تدريب)/;

function matchesAi(text: string): boolean {
  return AI_SIGNAL_EN.test(text) || AI_SIGNAL_AR.test(text);
}

const MODEL_SIGNAL =
  /\b(model|gpt-?\d|claude|gemini|llama|mistral|qwen|deepseek|grok|sonnet|opus|haiku|checkpoint|weights|parameters|context window|benchmark)\b/i;

const TOOL_SIGNAL =
  /\b(tool|app|platform|plugin|extension|sdk|cli|api|ide|editor|assistant|workflow|automation|product|launch|beta)\b/i;

// Deliberately narrow: "docs" and "guide" appear in the body text of almost
// every product page, so they only count when they are in the headline.
const LEARN_SIGNAL =
  /\b(tutorial|course|handbook|cookbook|lesson|explainer|paper|arxiv|preprint|walkthrough|docs|documentation|guide|how to|best practices)\b/i;

const NEWS_SIGNAL =
  /\b(announce|announced|announces|release|released|launch|launches|funding|acquire|acquisition|partnership|regulation|lawsuit|report)\b/i;

function evaluateHeuristically(
  input: EvaluationInput,
  snapshot: SourceSnapshot,
  candidates: DuplicateCandidate[],
): Evaluation {
  const haystack = [
    input.title,
    input.description,
    input.memberReason,
    snapshot.pageTitle ?? "",
    snapshot.metaDescription ?? "",
    truncate(snapshot.excerpt ?? "", 1200),
  ]
    .join(" ")
    .toLowerCase();

  // Classification reads the headline, not the body: page text mentions every
  // keyword at once and turns every submission into whatever is checked first.
  const label = [
    input.title,
    snapshot.pageTitle ?? "",
    snapshot.metaDescription ?? "",
    input.memberReason,
  ]
    .join(" ")
    .toLowerCase();

  const tier = domainTier(snapshot.domain);
  const originalDate = normaliseDate(snapshot.publishedDate);
  const local = localEligibility(input, snapshot);
  const reach = reachability(snapshot);
  /** Something concrete to go on even without the page: a named thing plus a real reason. */
  const specific =
    meaningfulWordCount(input.title) >= 3 &&
    meaningfulWordCount(input.memberReason) >= 6;

  // --- acceptance floor ---------------------------------------------------
  const aiRelated = matchesAi(haystack);
  const hasSubstance =
    Boolean(snapshot.pageTitle) || (snapshot.excerpt ?? "").length > 200;
  // A page that refused our request is not a failed contribution. We fall back
  // to what the member told us, and record that nothing was confirmed.
  const readableEnough =
    reach === "readable" ? hasSubstance : reach === "blocked" ? specific : false;
  const eligibility: EligibilityChecks = {
    aiRelated,
    specificInformation: hasSubstance || specific,
    usableSource: local.usableSource,
    understandableFromSource: readableEnough,
    memberExplainedWhy: local.memberExplainedWhy,
    usefulKnowledge: aiRelated && (hasSubstance || specific),
  };

  // --- duplicates ---------------------------------------------------------
  const top = candidates[0];
  let duplicateOutcome: DuplicateOutcome = "unique";
  let duplicateReason = "لم يُرسل شيء مشابه من قبل.";
  let confidence = 0;
  if (top && (top.sameUrl || top.score >= DUPLICATES.duplicateThreshold)) {
    // Offline we cannot read a new angle out of the source, so the member's
    // own reason is the only evidence of added value we have.
    const addsAngle =
      !top.sameUrl &&
      meaningfulWordCount(input.memberReason) >= 15 &&
      (/\b(tested|tried|used|compared|built|ran|measured|benchmarked)\b/i.test(
        input.memberReason,
      ) ||
        /(جربت|جرّبت|اختبرت|استخدمت|قارنت|بنيت|طبقت|طبّقت|نفذت|قست)/.test(
          input.memberReason,
        ));
    duplicateOutcome = addsAngle ? "same_topic_new_value" : "duplicate";
    confidence = top.sameUrl ? 1 : Math.min(0.9, top.score);
    duplicateReason = `تطابق ${Math.round(top.score * 100)}٪ مع "${truncate(
      top.contribution.title,
      70,
    )}" الذي أرسله ${top.contribution.memberName}${
      top.sameUrl ? " (نفس الرابط)" : ""
    }.${
      addsAngle
        ? " لكن الشرح يذكر تجربة أو مقارنة شخصية، فاعتُبرت زاوية جديدة."
        : ""
    }`;
  }

  const status = deriveStatus(eligibility, duplicateOutcome);

  // --- classification -----------------------------------------------------
  const primary = guessCategory(label, tier);
  const secondary: NewsletterCategory[] = [];
  if (primary !== "important_news" && NEWS_SIGNAL.test(label)) {
    secondary.push("important_news");
  }
  if (primary !== "social_trends" && tier === "social") {
    secondary.push("social_trends");
  }

  // --- audience & difficulty ---------------------------------------------
  const audience = guessAudience(haystack);
  const isLearning = primary === "learn_this_week";
  const difficulty: Difficulty = isLearning
    ? /\b(beginner|intro|basics|getting started|for beginners)\b/i.test(label) ||
      /(مبتدئ|مبتدئين|مقدمة|أساسيات)/.test(label)
      ? "beginner"
      : /\b(advanced|research|theory|proof|kernel|cuda|distributed training)\b/i.test(
            label,
          ) || /(متقدم|متقدّم|بحثي)/.test(label)
        ? "advanced"
        : "intermediate"
    : "not_applicable";

  // --- verification: offline, we never claim an independent check ---------
  const verification: VerificationStatus = snapshot.ok
    ? originalDate
      ? "partially_verified"
      : "not_independently_verified"
    : "not_independently_verified";

  // --- editorial judgement (0..10 per dimension) --------------------------
  const editorialRaw = {
    aiRelevance: aiRelated ? (MODEL_SIGNAL.test(haystack) ? 9 : 7) : 2,
    significance:
      (NEWS_SIGNAL.test(haystack) ? 5 : 3) +
      (tier === "trusted" ? 3 : tier === "reputable" ? 2 : 0) +
      (MODEL_SIGNAL.test(haystack) ? 1 : 0),
    usefulness:
      (TOOL_SIGNAL.test(haystack) ? 6 : 4) + (LEARN_SIGNAL.test(haystack) ? 2 : 0),
    recency: recencyJudgement(originalDate),
    sourceCredibility:
      tier === "trusted" ? 9 : tier === "reputable" ? 7 : tier === "social" ? 4 : 5,
    audienceFit: audience.length >= 2 ? 7 : 5,
    uniqueness: top ? Math.max(2, Math.round((1 - top.score) * 10)) : 8,
    newsletterValue: aiRelated ? (snapshot.ok ? 6 : 4) : 2,
  };
  const editorial = computeEditorial(
    scaleBreakdown(editorialRaw),
    verification,
    duplicateOutcome,
  );
  editorial.notes.unshift(recencyLabel(originalDate));

  const evidence: string[] = [
    reach === "readable"
      ? `تم فتح ${snapshot.domain} بنجاح (HTTP ${snapshot.status}).`
      : reach === "blocked"
        ? `رفض المصدر قراءتنا الآلية (${snapshot.error ?? "سبب غير معروف"})، هذا لا يعني أن الرابط خاطئ، لكنه يعني أننا لم نؤكد شيئًا منه.`
        : `الرابط لا يشير إلى صفحة موجودة: ${snapshot.error ?? "سبب غير معروف"}.`,
  ];
  if (snapshot.pageTitle) {
    evidence.push(`عنوان الصفحة: "${truncate(snapshot.pageTitle, 120)}".`);
  }
  evidence.push(
    tier === "trusted"
      ? `${snapshot.domain} ضمن قائمة المصادر الرسمية الموثوقة.`
      : tier === "reputable"
        ? `${snapshot.domain} تغطية تقنية موثوقة، وليس المصدر الأساسي.`
        : tier === "social"
          ? `${snapshot.domain} منصة تواصل اجتماعي، المحتوى غير رسمي.`
          : `${snapshot.domain || "النطاق"} ليس مصدرًا رسميًا معروفًا.`,
  );
  evidence.push("لم يجرِ تحقق مستقل من هذا الادعاء (الوضع غير المتصل).");

  return {
    status,
    rejectionReason:
      status === "rejected" ? describeFloorFailure(eligibility) : null,
    eligibility,
    classification: {
      primary,
      secondary,
      reason: "تصنيف مبدئي من الكلمات المفتاحية ونطاق المصدر.",
    },
    audience: {
      tags: audience,
      reason: "استُنتج من موضوع المحتوى ونوع المصدر.",
    },
    difficulty: { level: difficulty, prerequisites: [] },
    duplicate: {
      outcome: duplicateOutcome,
      ofId: duplicateOutcome === "unique" ? null : (top?.contribution.id ?? null),
      confidence,
      reason: duplicateReason,
      matches: candidateMatches(candidates),
    },
    verification: {
      status: verification,
      evidence,
      resolvedSource: snapshot.finalUrl ?? input.url,
      originalDate,
    },
    extracted: {
      title: snapshot.pageTitle ?? input.title ?? null,
      source: snapshot.domain || null,
      sourceUrl: snapshot.finalUrl ?? input.url,
      publicationDate: originalDate,
      entity: null,
      keyPoints: snapshot.metaDescription
        ? [truncate(snapshot.metaDescription, 300)]
        : [],
      capabilities: [],
      practicalValue: null,
      links: [],
    },
    aiInterpretation: "",
    aiSummary: truncate(
      snapshot.metaDescription || input.description || "",
      400,
    ),
    editorial: {
      score: editorial.score,
      rawScore: editorial.rawScore,
      breakdown: editorial.breakdown,
      notes: editorial.notes,
    },
    summaryForMember: buildHeuristicSummary(status, duplicateOutcome, tier),
    engine: "heuristic",
    model: null,
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Offline classification, in priority order. A model announcement that also
 * links to its docs is still a model announcement, so the release checks run
 * before the learning check, and all of them read the headline, not the body.
 */
function guessCategory(
  label: string,
  tier: ReturnType<typeof domainTier>,
): NewsletterCategory {
  if (tier === "social") return "social_trends";

  const isRelease =
    /\b(release|released|launch|launches|introducing|announc|now available|new)\b/i.test(
      label,
    ) || /(إطلاق|أطلقت|تطلق|إصدار|جديد)/.test(label);

  if (MODEL_SIGNAL.test(label) && isRelease) return "new_models";

  if (
    /\b(arxiv|paper|preprint|tutorial|course|handbook|cookbook|walkthrough|explainer|how to|best practices)\b/i.test(
      label,
    ) ||
    /(ورقة بحثية|دورة|شرح|دليل|درس)/.test(label)
  ) {
    return "learn_this_week";
  }

  if (TOOL_SIGNAL.test(label)) {
    return isRelease ? "new_tools" : "other_tools";
  }

  if (LEARN_SIGNAL.test(label)) return "learn_this_week";

  return "important_news";
}

function guessAudience(haystack: string): Audience[] {
  const out = new Set<Audience>();
  if (/\b(beginner|intro|basics|getting started|مبتدئ|مقدمة)\b/i.test(haystack)) {
    out.add("beginners");
  }
  if (/\b(api|sdk|cli|code|library|github|npm|python|typescript|framework)\b/i.test(haystack)) {
    out.add("developers");
  }
  if (/\b(llm|fine-?tun|inference|training|rag|embedding|agent|prompt)\b/i.test(haystack)) {
    out.add("ai_engineers");
  }
  if (/\b(dataset|data|analytics|pandas|statistic|benchmark)\b/i.test(haystack)) {
    out.add("data_scientists");
  }
  if (/\b(paper|arxiv|preprint|research|study|proof)\b/i.test(haystack)) {
    out.add("researchers");
  }
  if (/\b(design|ui|ux|figma|image|video|creative)\b/i.test(haystack)) {
    out.add("designers");
  }
  if (/\b(startup|funding|business|market|pricing|enterprise)\b/i.test(haystack)) {
    out.add("entrepreneurs");
  }
  if (
    /\b(course|university|student|students|lecture|curriculum)\b/i.test(haystack) ||
    /(طالب|طلاب|جامعة|جامعي|محاضرة|منهج)/.test(haystack)
  ) {
    out.add("university_students");
  }
  if (out.size === 0) out.add("general_users");
  return [...out].slice(0, 4);
}

function buildHeuristicSummary(
  status: ContributionStatus,
  duplicate: DuplicateOutcome,
  tier: string,
): string {
  if (status === "rejected") {
    return "لم تستوفِ المساهمة الحد الأدنى للقبول في الوضع غير المتصل.";
  }
  if (status === "duplicate") {
    return "المحتوى نفسه أُرسل سابقًا، لذا سُجّلت المساهمة كمكرر دون نقطة.";
  }
  const base =
    duplicate === "same_topic_new_value"
      ? "الموضوع مطروق سابقًا، لكن شرحك يضيف تجربة أو مقارنة جديدة."
      : "المساهمة جديدة ومرتبطة بالذكاء الاصطناعي، ولم يُعثر على تكرار.";
  const source =
    tier === "trusted"
      ? " والمصدر رسمي."
      : tier === "reputable"
        ? " والمصدر تغطية تقنية موثوقة."
        : " ولم يُتحقق من المصدر بشكل مستقل.";
  return base + source;
}

// ---------------------------------------------------------------------------
// Coercion helpers, a model can always hand back something unexpected
// ---------------------------------------------------------------------------

function describeFloorFailure(e: EligibilityChecks): string {
  const missing: string[] = [];
  if (!e.aiRelated) missing.push("غير مرتبطة بالذكاء الاصطناعي أو بنطاق الفريق");
  if (!e.specificInformation) missing.push("لا تحمل معلومة محددة وواضحة");
  if (!e.usableSource) missing.push("الرابط غير صالح أو غير قابل للفتح");
  if (!e.understandableFromSource) missing.push("لا يمكن فهم المحتوى من المصدر");
  if (!e.memberExplainedWhy) missing.push("لم يوضّح العضو سبب أهميتها");
  if (!e.usefulKnowledge) missing.push("لا تقدّم معرفة أو فائدة عملية");
  return missing.length
    ? `لم تستوفِ المساهمة الحد الأدنى: ${missing.join("، ")}.`
    : "لم تستوفِ المساهمة الحد الأدنى للقبول.";
}

function defaultSummary(
  status: ContributionStatus,
  duplicate: DuplicateOutcome,
): string {
  if (status === "rejected") return "لم تستوفِ المساهمة الحد الأدنى للقبول.";
  if (status === "duplicate") return "سبق إرسال المحتوى نفسه.";
  if (duplicate === "same_topic_new_value") {
    return "موضوع معروف لكن بزاوية جديدة من العضو.";
  }
  return "مساهمة صحيحة وجديدة.";
}

function coerceCategory(value: unknown): NewsletterCategory | null {
  const v = String(value ?? "").trim().toLowerCase();
  return (
    NEWSLETTER_CATEGORIES.find((c) => c === v) ?? null
  );
}

function cleanAudiences(value: unknown): Audience[] {
  const list = Array.isArray(value) ? value : [];
  const out = list
    .map((v) => String(v ?? "").trim().toLowerCase())
    .map((v) => AUDIENCES.find((a) => a === v))
    .filter((a): a is Audience => Boolean(a));
  return out.length ? [...new Set(out)] : ["general_users"];
}

function coerceDifficulty(value: unknown): Difficulty {
  const v = String(value ?? "").trim().toLowerCase();
  return DIFFICULTIES.find((d) => d === v) ?? "not_applicable";
}

function coerceDuplicate(value: unknown): DuplicateOutcome {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "duplicate") return "duplicate";
  if (v === "same_topic_new_value") return "same_topic_new_value";
  return "unique";
}

function coerceVerification(value: unknown): VerificationStatus {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "verified") return "verified";
  if (v === "partially_verified") return "partially_verified";
  return "not_independently_verified";
}

function cleanList(value: unknown, maxLen: number, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => truncate(String(v ?? "").trim(), maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function clamp01(n: unknown): number {
  const v = Number(n);
  if (Number.isNaN(v)) return 0;
  return Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
}

function normaliseDate(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
