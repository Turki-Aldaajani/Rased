import { NEWSLETTER } from "@/lib/config/rules";
import {
  editorialScore,
  effectiveCategory,
  effectiveStatus,
  type Contribution,
  type NewsletterCategory,
} from "@/lib/db/schema";
import { sameResource, truncate } from "@/lib/util/text";
import { contentSimilarity } from "@/lib/services/duplicates";
import { SECTIONS, type SectionId } from "./sections";
import type { UnusedContribution } from "./types";

/**
 * Pipeline steps 1–5: which contributions make the issue, and where.
 *
 * Deterministic on purpose, and blind to member points: the only measure of
 * "better" in here is the editorial score. Points decide the leaderboard;
 * they never decide what gets published.
 */

export interface Placement {
  contribution: Contribution;
  sectionId: SectionId;
  /** "secondary" when an empty section borrowed it from its secondary categories. */
  via: "primary" | "secondary";
}

export interface SelectionPlan {
  cycleKey: string;
  /** Accepted, evaluated, not removed, everything the engine may consider. */
  eligible: Contribution[];
  placements: Placement[];
  unused: UnusedContribution[];
  /** Eligible contributions per category, before any selection. */
  coverage: Record<NewsletterCategory, number>;
}

const EARNING = ["accepted", "accepted_with_new_angle"];

/** STEP 1, accepted contributions of the cycle that have an evaluation. */
export function eligibleFor(
  contributions: Contribution[],
  cycleKey: string,
): Contribution[] {
  return contributions.filter(
    (c) =>
      !c.removed &&
      c.cycleKey === cycleKey &&
      c.evaluation !== null &&
      EARNING.includes(effectiveStatus(c)) &&
      effectiveCategory(c) !== null,
  );
}

/** Stronger first: editorial score, then the fresher original, then the earlier submission. */
function rank(a: Contribution, b: Contribution): number {
  const byScore = editorialScore(b) - editorialScore(a);
  if (byScore !== 0) return byScore;
  const da = a.evaluation?.verification.originalDate ?? "";
  const db = b.evaluation?.verification.originalDate ?? "";
  if (da !== db) return db.localeCompare(da);
  return a.createdAt.localeCompare(b.createdAt);
}

function unusedEntry(
  c: Contribution,
  reason: UnusedContribution["reason"],
  detail: string,
): UnusedContribution {
  return {
    contributionId: c.id,
    title: c.title,
    memberName: c.memberName,
    category: effectiveCategory(c),
    editorialScore: editorialScore(c),
    reason,
    detail,
  };
}

function entityOf(c: Contribution): string {
  return (c.evaluation?.extracted.entity ?? "").trim().toLowerCase();
}

/** Two contributions describe the same event. */
function sameEvent(a: Contribution, b: Contribution): boolean {
  if (a.evaluation?.duplicate.ofId === b.id) return true;
  if (b.evaluation?.duplicate.ofId === a.id) return true;
  return contentSimilarity(a, b) >= NEWSLETTER.sameEventSimilarity;
}

export function planIssue(
  contributions: Contribution[],
  cycleKey: string,
): SelectionPlan {
  const eligible = eligibleFor(contributions, cycleKey);
  const unused: UnusedContribution[] = [];

  const coverage = Object.fromEntries(
    SECTIONS.map((s) => [s.category, 0]),
  ) as Record<NewsletterCategory, number>;
  for (const c of eligible) coverage[effectiveCategory(c)!]++;

  // STEP 2, exact duplicates: one item per source URL, the strongest one.
  const byStrength = [...eligible].sort(rank);
  const distinct: Contribution[] = [];
  for (const c of byStrength) {
    const twin = distinct.find((d) => sameResource(d.url, c.url));
    if (twin) {
      unused.push(
        unusedEntry(c, "duplicate_url", `المصدر نفسه مختار مسبقًا: "${truncate(twin.title, 60)}".`),
      );
    } else {
      distinct.push(c);
    }
  }

  // STEP 4, below the editorial floor, the item is not considered at all.
  const considered = distinct.filter((c) => {
    if (editorialScore(c) >= NEWSLETTER.minEditorialScore) return true;
    unused.push(
      unusedEntry(
        c,
        "below_threshold",
        `القيمة التحريرية ${editorialScore(c)} أقل من الحد ${NEWSLETTER.minEditorialScore}.`,
      ),
    );
    return false;
  });

  const placements: Placement[] = [];
  const placed = () => placements.map((p) => p.contribution);
  const inSection = (id: SectionId) =>
    placements.filter((p) => p.sectionId === id);
  const overflow: Contribution[] = [];

  const clashWithPlaced = (c: Contribution) =>
    placed().find((p) => sameEvent(p, c)) ?? null;

  // STEP 3 + 5, group by primary category and fill each section, strongest
  // first, one event once, different companies before repeats.
  for (const def of SECTIONS) {
    const group = considered
      .filter((c) => effectiveCategory(c) === def.category)
      .sort(rank);
    const deferred: Contribution[] = [];

    for (const c of group) {
      const clash = clashWithPlaced(c);
      if (clash) {
        unused.push(
          unusedEntry(c, "same_event", `يغطي الحدث نفسه الذي تغطيه "${truncate(clash.title, 60)}".`),
        );
        continue;
      }
      if (inSection(def.id).length >= def.limit) {
        overflow.push(c);
        continue;
      }
      const entity = entityOf(c);
      const sameEntity = entity
        ? inSection(def.id).filter((p) => entityOf(p.contribution) === entity)
            .length
        : 0;
      if (sameEntity >= NEWSLETTER.maxPerEntityPerSection) {
        deferred.push(c);
        continue;
      }
      placements.push({ contribution: c, sectionId: def.id, via: "primary" });
    }

    // Second pass: repeats of a company only fill slots nobody else wanted.
    for (const c of deferred) {
      if (inSection(def.id).length < def.limit) {
        placements.push({ contribution: c, sectionId: def.id, via: "primary" });
      } else {
        overflow.push(c);
      }
    }
  }

  // Balance, an empty or thin section may take an overflow item whose
  // secondary categories say it belongs there too. Never the same item twice.
  for (const c of overflow.sort(rank)) {
    const secondary = c.evaluation?.classification.secondary ?? [];
    const home = SECTIONS.find(
      (def) =>
        secondary.includes(def.category) &&
        inSection(def.id).length < Math.min(def.limit, 2),
    );
    if (home && !clashWithPlaced(c)) {
      placements.push({ contribution: c, sectionId: home.id, via: "secondary" });
    } else {
      unused.push(
        unusedEntry(c, "section_full", "القسم ممتلئ بمحتوى ذي قيمة تحريرية أعلى."),
      );
    }
  }

  // Keep newsletter order, strongest first inside each section.
  placements.sort((a, b) => {
    const sa = SECTIONS.findIndex((s) => s.id === a.sectionId);
    const sb = SECTIONS.findIndex((s) => s.id === b.sectionId);
    return sa - sb || rank(a.contribution, b.contribution);
  });

  return { cycleKey, eligible, placements, unused, coverage };
}
