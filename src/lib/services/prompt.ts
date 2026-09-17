import { ACCEPTANCE, EDITORIAL, POINTS } from "@/lib/config/rules";
import {
  AUDIENCES,
  DIFFICULTIES,
  NEWSLETTER_CATEGORIES,
  type NewsletterCategory,
} from "@/lib/db/schema";
import type { SourceSnapshot } from "./fetch-source";
import type { SearchHit } from "./web-search";
import type { DuplicateCandidate } from "./duplicates";
import { truncate } from "@/lib/util/text";

export interface EvaluationInput {
  title: string;
  url: string;
  description: string;
  /** The member's own answer to "why do you think this is important?". */
  memberReason: string;
  note: string;
  focusArea: NewsletterCategory | null;
  memberName: string;
}

export const SYSTEM_PROMPT = `You evaluate submissions for "Rased" (رصد), the internal contribution and knowledge system of the Enjaz Club AI Team. Members hunt for useful AI content and submit it; every two weeks the team turns the best of it into a newsletter.

Your job has two halves, and you must keep them apart:

A) IS THIS A VALID CONTRIBUTION? A yes/no judgement against a fixed floor. Every valid contribution is worth the same to the member, whatever it is about. You never decide how many points someone gets — the server does that, and it is always +1 for a valid contribution.

B) WHAT IS THIS CONTENT WORTH TO THE NEWSLETTER? A separate editorial judgement used only to order the newsletter.

Never let B leak into A. A beginner-level learning resource from a small company and a frontier model release from a major lab are both valid contributions. Rejecting something because it is "less important", "less interesting", "from a smaller company", "beginner-level" or "in a less prestigious category" is wrong.

THE ACCEPTANCE FLOOR — a contribution is valid when all of these hold:
1. It is genuinely related to AI or the team's scope.
2. It carries a specific, understandable piece of information.
3. The source URL is usable.
4. The content can actually be understood from the source.
5. The member explained why they think it matters.
6. It is not an exact or substantial duplicate of an earlier accepted contribution.
7. It offers at least some useful knowledge, discovery, tool, news, research, learning material or practical insight.

DUPLICATES — three outcomes, and only three:
- "unique": nothing earlier covers this.
- "duplicate": another member already submitted substantially the same content, with nothing meaningfully new.
- "same_topic_new_value": related to an earlier submission, but this member adds a real new angle — a test they ran, a comparison, a use case, extra information. This is NOT a duplicate; it is a valid contribution in its own right.

VERIFICATION — never fabricate it. Use web_search and web_fetch when you have them: confirm the thing exists, find the original announcement, and find when it was first published. If you could not check something, say so and set the verification status to "not_independently_verified". Claiming a check you did not perform is the worst error you can make here.

EXTRACTION — pull out only what the source actually says. Leave anything you could not find as an empty string or empty list. Never invent a date, a company, a capability or an audience.

THE MEMBER'S WORDS — their reason is preserved verbatim elsewhere. Your "aiInterpretation" is your own reading of it, not a rewrite of it.

Write every Arabic-facing field (summaryForMember, rejectionReason, classificationReason, audienceReason, duplicateReason, aiInterpretation, aiSummary, keyPoints, capabilities, practicalValue, evidence) in clear Modern Standard Arabic. Keep product, company and model names in their original Latin spelling. Dates stay ISO (YYYY-MM-DD) and URLs stay as they are.

Always finish by calling submit_evaluation exactly once.`;

export function buildUserPrompt(
  input: EvaluationInput,
  snapshot: SourceSnapshot,
  candidates: DuplicateCandidate[],
  hits: SearchHit[],
): string {
  const today = new Date().toISOString().slice(0, 10);
  const parts: string[] = [];

  parts.push(`Today's date: ${today}`);

  parts.push(
    [
      "",
      "## Submission",
      `Submitted by: ${input.memberName}`,
      `Title (named automatically from the link): ${input.title}`,
      `URL: ${input.url}`,
      `One-line description we generated: ${input.description || "(none)"}`,
      `Why the member thinks this is important (their own words): ${input.memberReason || "(not provided)"}`,
      `Extra note from the member: ${input.note || "(none)"}`,
      `Research direction the member picked: ${input.focusArea ?? "(none)"} — this is a direction only, NOT the category. Classify the content on its own merits.`,
    ].join("\n"),
  );

  const sourceBlock = snapshot.ok
    ? [
        `HTTP ${snapshot.status} OK`,
        `Final URL: ${snapshot.finalUrl}`,
        `Domain: ${snapshot.domain}`,
        `Page title: ${snapshot.pageTitle ?? "(none found)"}`,
        `Meta description: ${snapshot.metaDescription ?? "(none found)"}`,
        `Date found in page metadata: ${snapshot.publishedDate ?? "(none found)"}`,
        "Page text excerpt:",
        "---",
        truncate(snapshot.excerpt ?? "(empty)", 3500),
        "---",
      ].join("\n")
    : [
        `Could not read the page: ${snapshot.error ?? "unknown error"}`,
        `Domain: ${snapshot.domain || "(unparseable)"}`,
        "Decide from web search alone whether this claim is real. If you cannot, say so — do not guess.",
      ].join("\n");

  parts.push(`\n## What our server saw when it opened that URL\n${sourceBlock}`);

  if (hits.length > 0) {
    const list = hits
      .map((h, i) => {
        const date = h.publishedDate ? `\n   date: ${h.publishedDate}` : "";
        return `${i + 1}. ${h.title}\n   ${h.url}\n   ${truncate(h.snippet, 350)}${date}`;
      })
      .join("\n");
    parts.push(`\n## External web search results\n${list}`);
  }

  const priorBlock =
    candidates.length === 0
      ? "None — nothing similar has been submitted before."
      : candidates
          .map((c, i) => {
            const k = c.contribution;
            const sim = `${(c.score * 100).toFixed(0)}%${c.sameUrl ? ", SAME URL" : ""}`;
            return [
              `[index ${i}] by ${k.memberName} on ${k.createdAt.slice(0, 10)} (local text similarity ${sim})`,
              `    Title: ${k.title}`,
              `    URL: ${k.url}`,
              `    Description: ${truncate(k.description, 400)}`,
              `    Their reason: ${truncate(k.memberReason, 300)}`,
            ].join("\n");
          })
          .join("\n");

  parts.push(
    `\n## Earlier submissions that might cover the same thing\n${priorBlock}`,
  );

  parts.push(
    [
      "",
      "## Newsletter categories",
      "important_news  — significant AI news the team should know about.",
      "new_models      — a newly released or updated AI model.",
      "new_tools       — a genuinely new AI tool or product.",
      "other_tools     — a useful tool that is not new, or a notable update to an existing one.",
      "learn_this_week — tutorials, courses, papers, explainers, anything you sit down and learn from.",
      "social_trends   — what the AI community is discussing, reacting to, or arguing about.",
      "",
      "Pick one primary category, and add secondary categories when the content genuinely belongs to more than one. Do not force everything into a single conceptual box.",
      "",
      `## Audience\nChoose from: ${AUDIENCES.join(", ")}. Pick the ones the content actually serves, with a short reason. Do not invent an audience without evidence.`,
      "",
      `## Difficulty\nFor learning content choose one of: ${DIFFICULTIES.filter((d) => d !== "not_applicable").join(", ")}, and list prerequisites when they matter. For everything else use "not_applicable" and leave prerequisites empty.`,
      "",
      "## Editorial judgement (newsletter only — NOT member points)",
      "Rate each dimension 0-10. These decide what the newsletter leads with; they never change what the member earns.",
      "  aiRelevance       — how squarely this sits in AI.",
      "  significance      — how much this matters in the field right now.",
      "  usefulness        — practical value for projects, study, work.",
      "  recency           — leave your best judgement; the server recomputes it from the original date.",
      "  sourceCredibility — official source or peer-reviewed beats tech press beats unknown blog.",
      "  audienceFit       — fit with students, developers and researchers on this team.",
      "  uniqueness        — how rarely this has been covered.",
      "  newsletterValue   — how well it would read as a newsletter item.",
      "",
      "## Acceptance decision",
      "Set each eligibility flag honestly, then set status:",
      '  "accepted"                — valid and unique.',
      '  "accepted_with_new_angle" — valid, related to an earlier submission, but adds real new value.',
      '  "duplicate"               — substantially the same as an earlier submission.',
      '  "rejected"                — it fails the acceptance floor. Give a specific, factual rejectionReason.',
      `A member's contribution reason counts as given when it says something specific — roughly ${ACCEPTANCE.minReasonWords} meaningful words or more. Do not demand an essay.`,
      "",
      `For context only: a valid contribution is worth ${POINTS.perValidContribution} point, and a member can earn at most ${POINTS.maxPerCycle} points per two-week cycle. You do not compute this.`,
      "",
      "Now research the submission and call submit_evaluation.",
    ].join("\n"),
  );

  return parts.join("\n");
}

const dimensionProps = Object.fromEntries(
  Object.keys(EDITORIAL.weights).map((key) => [
    key,
    { type: "integer", description: "0 to 10." },
  ]),
);

export const EVALUATION_TOOL = {
  name: "submit_evaluation",
  description:
    "Submit the final structured evaluation of this Rased contribution. Call exactly once, after researching.",
  strict: true as const,
  input_schema: {
    type: "object" as const,
    properties: {
      status: {
        type: "string",
        enum: ["accepted", "accepted_with_new_angle", "duplicate", "rejected"],
      },
      rejectionReason: {
        type: "string",
        description:
          "Why it was rejected, in Arabic. Empty string when not rejected.",
      },
      eligibility: {
        type: "object",
        properties: {
          aiRelated: { type: "boolean" },
          specificInformation: { type: "boolean" },
          usableSource: { type: "boolean" },
          understandableFromSource: { type: "boolean" },
          memberExplainedWhy: { type: "boolean" },
          usefulKnowledge: { type: "boolean" },
        },
        required: [
          "aiRelated",
          "specificInformation",
          "usableSource",
          "understandableFromSource",
          "memberExplainedWhy",
          "usefulKnowledge",
        ],
        additionalProperties: false,
      },

      primaryCategory: { type: "string", enum: [...NEWSLETTER_CATEGORIES] },
      secondaryCategories: {
        type: "array",
        items: { type: "string", enum: [...NEWSLETTER_CATEGORIES] },
        description: "Zero or more, excluding the primary category.",
      },
      classificationReason: {
        type: "string",
        description: "One sentence in Arabic on why that category.",
      },

      audience: {
        type: "array",
        items: { type: "string", enum: [...AUDIENCES] },
        description: "One or more audiences the content actually serves.",
      },
      audienceReason: { type: "string", description: "One sentence in Arabic." },

      difficulty: { type: "string", enum: [...DIFFICULTIES] },
      prerequisites: {
        type: "array",
        items: { type: "string" },
        description:
          "Prerequisites for learning content, in Arabic. Empty when not applicable.",
      },

      duplicateOutcome: {
        type: "string",
        enum: ["unique", "same_topic_new_value", "duplicate"],
      },
      duplicateOfIndex: {
        type: "integer",
        description:
          "Index of the earlier submission this overlaps with, or -1 if none.",
      },
      duplicateConfidence: {
        type: "number",
        description: "0 to 1 — how sure you are about that match.",
      },
      duplicateReason: {
        type: "string",
        description: "One or two sentences in Arabic explaining the decision.",
      },

      verificationStatus: {
        type: "string",
        enum: ["verified", "partially_verified", "not_independently_verified"],
      },
      evidence: {
        type: "array",
        items: { type: "string" },
        description:
          "2 to 5 short Arabic bullets of what you actually confirmed, each saying where it came from.",
      },
      originalDate: {
        type: "string",
        description:
          "Original publication/release date as YYYY-MM-DD, or the exact string 'unknown'.",
      },
      resolvedSource: {
        type: "string",
        description:
          "URL of the most official/original source you found, or 'unknown'.",
      },

      extractedSource: {
        type: "string",
        description: "Name of the publication or site, or empty string.",
      },
      extractedEntity: {
        type: "string",
        description:
          "Company, person or project behind it, or empty string if not stated.",
      },
      keyPoints: {
        type: "array",
        items: { type: "string" },
        description: "2 to 5 key points in Arabic, taken from the source.",
      },
      capabilities: {
        type: "array",
        items: { type: "string" },
        description:
          "Important capabilities or features stated by the source, in Arabic. Empty if none.",
      },
      practicalValue: {
        type: "string",
        description:
          "One sentence in Arabic on what the team could actually do with this.",
      },
      usefulLinks: {
        type: "array",
        items: { type: "string" },
        description: "Extra useful URLs found in the source. Empty if none.",
      },

      aiInterpretation: {
        type: "string",
        description:
          "Your reading of the member's stated reason, in Arabic. Never a rewrite of their words.",
      },
      aiSummary: {
        type: "string",
        description: "Two or three sentences in Arabic summarising the content.",
      },
      summaryForMember: {
        type: "string",
        description:
          "One or two sentences in Arabic telling the member what happened and why. Concise — not your whole reasoning.",
      },

      editorial: {
        type: "object",
        properties: dimensionProps,
        required: Object.keys(EDITORIAL.weights),
        additionalProperties: false,
      },
    },
    required: [
      "status",
      "rejectionReason",
      "eligibility",
      "primaryCategory",
      "secondaryCategories",
      "classificationReason",
      "audience",
      "audienceReason",
      "difficulty",
      "prerequisites",
      "duplicateOutcome",
      "duplicateOfIndex",
      "duplicateConfidence",
      "duplicateReason",
      "verificationStatus",
      "evidence",
      "originalDate",
      "resolvedSource",
      "extractedSource",
      "extractedEntity",
      "keyPoints",
      "capabilities",
      "practicalValue",
      "usefulLinks",
      "aiInterpretation",
      "aiSummary",
      "summaryForMember",
      "editorial",
    ],
    additionalProperties: false,
  },
};

export interface EvaluationToolInput {
  status: "accepted" | "accepted_with_new_angle" | "duplicate" | "rejected";
  rejectionReason: string;
  eligibility: {
    aiRelated: boolean;
    specificInformation: boolean;
    usableSource: boolean;
    understandableFromSource: boolean;
    memberExplainedWhy: boolean;
    usefulKnowledge: boolean;
  };
  primaryCategory: NewsletterCategory;
  secondaryCategories: NewsletterCategory[];
  classificationReason: string;
  audience: string[];
  audienceReason: string;
  difficulty: string;
  prerequisites: string[];
  duplicateOutcome: "unique" | "same_topic_new_value" | "duplicate";
  duplicateOfIndex: number;
  duplicateConfidence: number;
  duplicateReason: string;
  verificationStatus:
    | "verified"
    | "partially_verified"
    | "not_independently_verified";
  evidence: string[];
  originalDate: string;
  resolvedSource: string;
  extractedSource: string;
  extractedEntity: string;
  keyPoints: string[];
  capabilities: string[];
  practicalValue: string;
  usefulLinks: string[];
  aiInterpretation: string;
  aiSummary: string;
  summaryForMember: string;
  editorial: Record<string, number>;
}
