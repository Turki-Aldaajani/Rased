import { DUPLICATES } from "@/lib/config/rules";
import type { Contribution, DuplicateFinding } from "@/lib/db/schema";
import { effectiveStatus } from "@/lib/db/schema";
import { sameResource, similarity, truncate } from "@/lib/util/text";

export interface DuplicateCandidate {
  contribution: Contribution;
  score: number; // 0..1
  sameUrl: boolean;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Text similarity between two submissions (0..1).
 *
 * Many sites put the same meta description on every page. When two different
 * pages share it word for word, it says nothing about their content, so only
 * the titles are compared.
 */
export function contentSimilarity(
  a: { title: string; description: string },
  b: { title: string; description: string },
): number {
  const titleScore = similarity(a.title, b.title);
  const sharedBoilerplate =
    squash(a.description).length > 0 &&
    squash(a.description) === squash(b.description);
  if (sharedBoilerplate) return titleScore;
  return Math.max(
    similarity(`${a.title} ${a.description}`, `${b.title} ${b.description}`),
    titleScore * 0.9,
  );
}

/**
 * Cheap local pass that narrows the field before the evaluator reads it.
 * Signals: normalised URL, title similarity and body-text similarity. The
 * evaluator makes the actual call, including the "same topic, new value"
 * case, which text similarity alone cannot see.
 */
export function findDuplicateCandidates(
  input: { title: string; url: string; description: string; memberReason: string },
  existing: Contribution[],
  limit = DUPLICATES.maxCandidates,
): DuplicateCandidate[] {
  return existing
    .filter((c) => !c.removed && effectiveStatus(c) !== "rejected")
    .map((c) => {
      const sameUrl = sameResource(input.url, c.url);
      const textScore = contentSimilarity(input, c);
      // A shared URL is strong evidence on its own.
      const score = sameUrl ? Math.max(0.9, textScore) : textScore;
      return { contribution: c, score, sameUrl };
    })
    .filter((c) => c.sameUrl || c.score >= DUPLICATES.candidateThreshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** The compared-against list stored on every evaluation, for the admin view. */
export function candidateMatches(
  candidates: DuplicateCandidate[],
): DuplicateFinding["matches"] {
  return candidates.map((c) => ({
    id: c.contribution.id,
    title: truncate(c.contribution.title, 120),
    memberName: c.contribution.memberName,
    score: Math.round(c.score * 100) / 100,
  }));
}

/**
 * Re-applies the duplicate outcome when an identical source turns out to
 * already exist at save time. Two people pasting the same link within the same
 * second would otherwise both read an empty history and both be counted.
 *
 * Only the duplicate fields change: the classification, audience and extracted
 * content of this submission stay exactly as evaluated.
 */
export function applyLateDuplicate(
  c: Contribution,
  earlier: Contribution,
): Contribution {
  if (!c.evaluation || c.evaluation.duplicate.outcome === "duplicate") return c;

  const evaluation = {
    ...c.evaluation,
    status: "duplicate" as const,
    duplicate: {
      ...c.evaluation.duplicate,
      outcome: "duplicate" as const,
      ofId: earlier.id,
      confidence: 1,
      reason: `أرسل ${earlier.memberName} المصدر نفسه قبل لحظات ("${truncate(
        earlier.title,
        70,
      )}").`,
    },
    summaryForMember:
      "وصلت مساهمة بالمصدر نفسه قبل مساهمتك بلحظات، لذا سُجّلت هذه كمكرر.",
  };

  return { ...c, status: "duplicate", evaluation };
}
