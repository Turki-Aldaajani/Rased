import { SCORING } from "@/lib/config/scoring";
import type { Contribution } from "@/lib/db/schema";
import { sameResource, similarity, truncate } from "@/lib/util/text";
import { computeFinalScore } from "./scoring";

export interface DuplicateCandidate {
  contribution: Contribution;
  score: number; // 0..1
  sameUrl: boolean;
}

/**
 * Cheap local pass that finds prior submissions covering the same thing.
 * The AI makes the final call — this just narrows what it has to read.
 */
export function findDuplicateCandidates(
  input: { title: string; url: string; description: string },
  existing: Contribution[],
  limit = 5,
): DuplicateCandidate[] {
  const needle = `${input.title} ${input.description}`;
  return existing
    .map((c) => {
      const sameUrl = sameResource(input.url, c.url);
      const textScore = similarity(needle, `${c.title} ${c.description}`);
      const titleScore = similarity(input.title, c.title);
      // A shared URL is strong evidence on its own.
      const score = sameUrl
        ? Math.max(0.9, textScore)
        : Math.max(textScore, titleScore * 0.9);
      return { contribution: c, score, sameUrl };
    })
    .filter(
      (c) => c.sameUrl || c.score >= SCORING.duplicateSimilarityThreshold * 0.6,
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Re-applies duplicate status when an identical source turns out to already
 * exist at save time. Two people pasting the same link within the same second
 * would otherwise both read an empty history and both be scored as original.
 */
export function applyLateDuplicate(
  c: Contribution,
  earlier: Contribution,
): Contribution {
  if (c.evaluation.duplicate === "duplicate") return c;

  const evaluation = { ...c.evaluation, breakdown: { ...c.evaluation.breakdown } };
  evaluation.duplicate = "duplicate";
  evaluation.duplicateOfId = earlier.id;
  evaluation.duplicateReason = `The same source was submitted by ${earlier.memberName} moments earlier ("${truncate(
    earlier.title,
    70,
  )}").`;

  const { rawScore, finalScore, penalties } = computeFinalScore(
    evaluation.breakdown,
    evaluation.verified,
    "duplicate",
  );
  evaluation.rawScore = rawScore;
  evaluation.finalScore = finalScore;
  evaluation.evidence = [...evaluation.evidence, ...penalties];

  return { ...c, evaluation };
}
