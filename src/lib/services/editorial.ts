import {
  EDITORIAL,
  EDITORIAL_TOTAL,
  REPUTABLE_DOMAINS,
  SOCIAL_DOMAINS,
  TRUSTED_DOMAINS,
  type EditorialDimension,
} from "@/lib/config/rules";
import type {
  DuplicateOutcome,
  EditorialBreakdown,
  VerificationStatus,
} from "@/lib/db/schema";
import { clamp } from "@/lib/util/text";
import { daysBetween } from "@/lib/util/date";

/**
 * Editorial value maths, deterministic, and deliberately isolated from the
 * points engine. The evaluator supplies raw 0..10 judgements per dimension;
 * everything after that happens here, so the same inputs always produce the
 * same number, and changing the weights changes only this file's inputs.
 *
 * Nothing in here may be used to award member points.
 */

const DIMENSIONS = Object.keys(EDITORIAL.weights) as EditorialDimension[];

/** Scales the evaluator's 0..10 judgements onto the configured weights. */
export function scaleBreakdown(
  raw: Partial<Record<EditorialDimension, number>>,
): EditorialBreakdown {
  const out = {} as EditorialBreakdown;
  for (const key of DIMENSIONS) {
    const weight = EDITORIAL.weights[key];
    const judgement = clamp(Number(raw[key] ?? 0), 0, 10);
    out[key] = Math.round((judgement / 10) * weight);
  }
  return out;
}

export function sumBreakdown(b: EditorialBreakdown): number {
  return DIMENSIONS.reduce((sum, key) => sum + (b[key] ?? 0), 0);
}

export interface EditorialResult {
  score: number;
  rawScore: number;
  breakdown: EditorialBreakdown;
  notes: string[];
}

export function computeEditorial(
  breakdown: EditorialBreakdown,
  verification: VerificationStatus,
  duplicate: DuplicateOutcome,
): EditorialResult {
  const rawScore = clamp(sumBreakdown(breakdown), 0, EDITORIAL_TOTAL);
  const dupMult = EDITORIAL.duplicateMultiplier[duplicate];
  const verMult = EDITORIAL.verificationMultiplier[verification];
  const notes: string[] = [];

  if (dupMult < 1) {
    notes.push(
      duplicate === "duplicate"
        ? `محتوى مكرر، قيمته التحريرية للنشرة ${Math.round(dupMult * 100)}٪.`
        : `نفس الموضوع بزاوية جديدة، قيمته التحريرية ${Math.round(dupMult * 100)}٪.`,
    );
  }
  if (verMult < 1) {
    notes.push(
      verification === "not_independently_verified"
        ? `لم يُتحقق منه بشكل مستقل، قيمته التحريرية ${Math.round(verMult * 100)}٪.`
        : `تحقق جزئي، قيمته التحريرية ${Math.round(verMult * 100)}٪.`,
    );
  }

  return {
    score: clamp(Math.round(rawScore * dupMult * verMult), 0, EDITORIAL_TOTAL),
    rawScore,
    breakdown,
    notes,
  };
}

/** Recency judgement (0..10) from the original publication date. */
export function recencyJudgement(originalDate: string | null): number {
  if (!originalDate) return 4; // unknown date, conservative, not zero
  const d = new Date(originalDate);
  if (Number.isNaN(d.getTime())) return 4;
  const age = daysBetween(d, new Date());
  if (age < 0) return 10; // future-dated (embargo/announcement), treat as brand new
  for (const band of EDITORIAL.recencyBands) {
    if (age <= band.maxAgeDays) return Math.round(band.fraction * 10);
  }
  return 0;
}

export function recencyLabel(originalDate: string | null): string {
  if (!originalDate) return "تاريخ النشر غير معروف";
  const d = new Date(originalDate);
  if (Number.isNaN(d.getTime())) return "تاريخ النشر غير واضح";
  const age = daysBetween(d, new Date());
  for (const band of EDITORIAL.recencyBands) {
    if (age <= band.maxAgeDays) return band.labelAr;
  }
  return "أقدم من عام";
}

export type DomainTier = "trusted" | "reputable" | "social" | "unknown";

export function domainTier(domain: string): DomainTier {
  const d = (domain || "").toLowerCase();
  const match = (list: readonly string[]) =>
    list.some((t) => d === t || d.endsWith(`.${t}`));
  if (match(TRUSTED_DOMAINS)) return "trusted";
  if (match(REPUTABLE_DOMAINS)) return "reputable";
  if (match(SOCIAL_DOMAINS)) return "social";
  return "unknown";
}
