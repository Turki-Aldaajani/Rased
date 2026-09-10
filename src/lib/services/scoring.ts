import { SCORING, TOTAL_POINTS } from "@/lib/config/scoring";
import type {
  DuplicateStatus,
  ScoreBreakdown,
  VerificationStatus,
} from "@/lib/db/schema";
import { clamp } from "@/lib/util/text";
import { daysBetween } from "@/lib/util/date";

/**
 * Deterministic score maths. The evaluator (AI or heuristic) only supplies
 * the six sub-scores; everything after that happens here so the same inputs
 * always produce the same final number.
 */

export function clampBreakdown(raw: Partial<ScoreBreakdown>): ScoreBreakdown {
  const max = SCORING.maxPoints;
  return {
    importance: clamp(Math.round(raw.importance ?? 0), 0, max.importance),
    recency: clamp(Math.round(raw.recency ?? 0), 0, max.recency),
    usefulness: clamp(Math.round(raw.usefulness ?? 0), 0, max.usefulness),
    relevance: clamp(Math.round(raw.relevance ?? 0), 0, max.relevance),
    sourceReliability: clamp(
      Math.round(raw.sourceReliability ?? 0),
      0,
      max.sourceReliability,
    ),
    personalContribution: clamp(
      Math.round(raw.personalContribution ?? 0),
      0,
      max.personalContribution,
    ),
  };
}

export function sumBreakdown(b: ScoreBreakdown): number {
  return (
    b.importance +
    b.recency +
    b.usefulness +
    b.relevance +
    b.sourceReliability +
    b.personalContribution
  );
}

export interface FinalScoreResult {
  rawScore: number;
  finalScore: number;
  penalties: string[];
}

export function computeFinalScore(
  breakdown: ScoreBreakdown,
  verified: VerificationStatus,
  duplicate: DuplicateStatus,
): FinalScoreResult {
  const rawScore = sumBreakdown(breakdown);
  const dupMult = SCORING.duplicateMultiplier[duplicate];
  const verMult = SCORING.verificationMultiplier[verified];
  const penalties: string[] = [];

  if (dupMult < 1) {
    penalties.push(
      duplicate === "duplicate"
        ? `تكرار لمساهمة سابقة — خُفِّض التقييم إلى ${Math.round(dupMult * 100)}٪.`
        : `تكرار جزئي — خُفِّض التقييم إلى ${Math.round(dupMult * 100)}٪.`,
    );
  }
  if (verMult < 1) {
    penalties.push(
      verified === "unverified"
        ? `تعذّر التحقق من المصدر — خُفِّض التقييم إلى ${Math.round(verMult * 100)}٪.`
        : `تحقق جزئي فقط — خُفِّض التقييم إلى ${Math.round(verMult * 100)}٪.`,
    );
  }

  const finalScore = clamp(
    Math.round(rawScore * dupMult * verMult),
    0,
    TOTAL_POINTS,
  );
  return { rawScore, finalScore, penalties };
}

/** Points for recency, straight from the configured bands. */
export function recencyPoints(originalDate: string | null): number {
  if (!originalDate) return 4; // unknown date — conservative, not zero
  const d = new Date(originalDate);
  if (Number.isNaN(d.getTime())) return 4;
  const age = daysBetween(d, new Date());
  if (age < 0) return SCORING.recencyBands[0].points; // future-dated, treat as brand new
  for (const band of SCORING.recencyBands) {
    if (age <= band.maxAgeDays) return band.points;
  }
  return 0;
}

export function recencyLabel(originalDate: string | null): string {
  if (!originalDate) return "تاريخ النشر غير معروف";
  const d = new Date(originalDate);
  if (Number.isNaN(d.getTime())) return "تاريخ النشر غير واضح";
  const age = daysBetween(d, new Date());
  for (const band of SCORING.recencyBands) {
    if (age <= band.maxAgeDays) return band.labelAr;
  }
  return "أقدم من عام";
}
