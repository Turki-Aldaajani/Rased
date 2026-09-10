import { SCORING } from "@/lib/config/scoring";
import type { ContributionType } from "@/lib/db/schema";
import type { SourceSnapshot } from "./fetch-source";
import type { SearchHit } from "./web-search";
import type { DuplicateCandidate } from "./duplicates";
import { truncate } from "@/lib/util/text";

export interface EvaluationInput {
  title: string;
  url: string;
  description: string;
  whyUseful: string;
  type: ContributionType;
  memberName: string;
}

export const SYSTEM_PROMPT = `You evaluate submissions for "Rased", an internal gamified knowledge-sharing game for a small AI team of students and practitioners.

Team members hunt for genuinely useful AI news, tools, research, projects and techniques and submit them. Your job is to check whether a submission is real, work out how important and useful it is for this specific team, detect duplicates of earlier submissions, and award sub-scores.

How to work:
1. Actually check the claim. Use web_search and web_fetch to confirm the thing exists, find the ORIGINAL announcement or paper, and find when it was first published or released.
2. Never treat something as new just because the member submitted it today. Recency is measured from the original publication/release date.
3. Judge importance for an AI-focused student/practitioner team: a major model release or a genuinely new capability is high; a small feature tweak or generic tech news is low.
4. Judge the member's own contribution from their "Why is this useful?" note. Reward specific, tested, applied insight. Do not reward long but empty text. A generic restatement of the headline is worth very little.
5. Compare against the earlier submissions you are given. Same news/tool already submitted = duplicate. Same topic but with materially new information, testing, or a concrete use case = partially duplicate, not a full duplicate.

Be fair, consistent and concise. Explain your reasoning in plain language a student can follow. Always finish by calling the submit_evaluation tool exactly once.`;

export function buildUserPrompt(
  input: EvaluationInput,
  snapshot: SourceSnapshot,
  candidates: DuplicateCandidate[],
  hits: SearchHit[],
): string {
  const today = new Date().toISOString().slice(0, 10);
  const max = SCORING.maxPoints;
  const parts: string[] = [];

  parts.push(`Today's date: ${today}`);

  parts.push(
    [
      "",
      "## Submission",
      `Submitted by: ${input.memberName}`,
      `Type: ${input.type}`,
      `Title: ${input.title}`,
      `URL: ${input.url}`,
      `What they found: ${input.description || "(not provided)"}`,
      `Why is this useful (their own words): ${input.whyUseful || "(not provided)"}`,
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
        "You must decide from web search alone whether this claim is real.",
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
      ? "None - nothing similar has been submitted before."
      : candidates
          .map((c, i) => {
            const k = c.contribution;
            const sim = `${(c.score * 100).toFixed(0)}%${c.sameUrl ? ", SAME URL" : ""}`;
            return [
              `[index ${i}] by ${k.memberName} on ${k.createdAt.slice(0, 10)} (local text similarity ${sim})`,
              `    Title: ${k.title}`,
              `    URL: ${k.url}`,
              `    What they found: ${truncate(k.description, 400)}`,
              `    Why useful: ${truncate(k.whyUseful, 300)}`,
            ].join("\n");
          })
          .join("\n");

  parts.push(
    `\n## Earlier submissions that might cover the same thing\n${priorBlock}`,
  );

  const recencyLines = SCORING.recencyBands
    .map((b) => {
      const window =
        b.maxAgeDays === Infinity ? "" : ` (up to ${b.maxAgeDays} days old)`;
      return `  ${b.points} = ${b.label}${window}`;
    })
    .join("\n");

  parts.push(
    [
      "",
      "## Scoring rubric",
      "",
      `importance (0-${max.importance}) - how much this matters to an AI-focused student/team.`,
      `  ${max.importance} = major model release, major new capability, technology that changes what the team can do.`,
      `  ~${Math.round(max.importance * 0.6)} = useful new feature or solid tool with moderate impact.`,
      `  ~${Math.round(max.importance * 0.2)} = minor update, general tech news, little practical value here.`,
      "",
      `recency (0-${max.recency}) - based ONLY on the original publication/release date.`,
      recencyLines,
      "  (Our server recomputes this from the originalDate you return, so focus on getting the date right.)",
      "",
      `usefulness (0-${max.usefulness}) - practical value for AI projects, students, programming, data, research, learning, productivity.`,
      "",
      `relevance (0-${max.relevance}) - how well it fits the declared type "${input.type}" and the team's AI focus.`,
      "",
      `sourceReliability (0-${max.sourceReliability}) - top marks for an official company page, official docs, or a peer-reviewed/preprint paper; middle for reputable tech press; low for unknown blogs, aggregators, or unreachable pages.`,
      "",
      `personalContribution (0-${max.personalContribution}) - the member's own added value in "Why is this useful?".`,
      "  0-2 = empty, or just restates the headline.",
      "  3-5 = a clear, specific reason it matters to this team.",
      "  6-8 = names a concrete use case or project it would help.",
      `  9-${max.personalContribution} = they actually tried it and report what happened.`,
      "",
      "Set verified to:",
      '  "verified" - you confirmed the claim exists and found the original source/date.',
      '  "partial" - the thing seems real but you could not confirm the date, the original source, or part of the claim.',
      '  "unverified" - you could not confirm this exists at all, or the page was unreachable and search found nothing.',
      "",
      "Set duplicateStatus to:",
      '  "original" - nothing earlier covers this.',
      '  "partial" - an earlier submission covers the same topic, but this one adds materially new information, testing, or a concrete use case.',
      '  "duplicate" - the same news/tool/paper, with nothing meaningfully new added.',
      "Set duplicateOfIndex to the [index] of the earlier submission it duplicates, or -1.",
      "",
      "Now research the submission and call submit_evaluation.",
    ].join("\n"),
  );

  return parts.join("\n");
}

export const EVALUATION_TOOL = {
  name: "submit_evaluation",
  description:
    "Submit the final structured evaluation of this Rased contribution. Call exactly once, after researching.",
  strict: true as const,
  input_schema: {
    type: "object" as const,
    properties: {
      verified: {
        type: "string",
        enum: ["verified", "partial", "unverified"],
        description: "How well the claim could be confirmed on the web.",
      },
      originalDate: {
        type: "string",
        description:
          "Original publication/release date of the thing itself as YYYY-MM-DD, or the exact string 'unknown'. NOT the date it was submitted.",
      },
      resolvedSource: {
        type: "string",
        description:
          "URL of the most official/original source you found, or 'unknown'.",
      },
      duplicateStatus: {
        type: "string",
        enum: ["original", "partial", "duplicate"],
      },
      duplicateOfIndex: {
        type: "integer",
        description:
          "Index of the earlier submission this duplicates, or -1 if none.",
      },
      duplicateReason: {
        type: "string",
        description:
          "One or two sentences explaining the duplicate decision. Use 'Nothing similar was submitted before.' when original.",
      },
      importance: { type: "integer", description: "0 to 25." },
      recency: { type: "integer", description: "0 to 20." },
      usefulness: { type: "integer", description: "0 to 20." },
      relevance: { type: "integer", description: "0 to 15." },
      sourceReliability: { type: "integer", description: "0 to 10." },
      personalContribution: { type: "integer", description: "0 to 10." },
      evidence: {
        type: "array",
        items: { type: "string" },
        description:
          "2 to 5 short bullet points of what you actually confirmed, each mentioning where it came from.",
      },
      reason: {
        type: "string",
        description:
          "Two or three sentences explaining the overall score, in plain language.",
      },
    },
    required: [
      "verified",
      "originalDate",
      "resolvedSource",
      "duplicateStatus",
      "duplicateOfIndex",
      "duplicateReason",
      "importance",
      "recency",
      "usefulness",
      "relevance",
      "sourceReliability",
      "personalContribution",
      "evidence",
      "reason",
    ],
    additionalProperties: false,
  },
};

export interface EvaluationToolInput {
  verified: "verified" | "partial" | "unverified";
  originalDate: string;
  resolvedSource: string;
  duplicateStatus: "original" | "partial" | "duplicate";
  duplicateOfIndex: number;
  duplicateReason: string;
  importance: number;
  recency: number;
  usefulness: number;
  relevance: number;
  sourceReliability: number;
  personalContribution: number;
  evidence: string[];
  reason: string;
}
