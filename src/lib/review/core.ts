import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { effectiveCategory, type Contribution, type Database, type Reviewer } from "@/lib/db/schema";
import { applyItemEdit, str } from "@/lib/newsletter/edit";
import { NewsletterError } from "@/lib/newsletter/errors";
import type { SectionId } from "@/lib/newsletter/sections";
import type {
  ItemReview,
  NewsletterIssue,
  NewsletterItem,
  ReviewEdit,
} from "@/lib/newsletter/types";
import { validateIssue } from "@/lib/newsletter/validate";
import { FIELD_MAX, editableFields, fieldValue, roleSees, type ReviewField } from "./roles";

/**
 * Everything a reviewer can do, as plain functions over an issue. The service
 * runs them under the store's lock; the tests run them as they are.
 */

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/** 32 random bytes, URL-safe. Shown once; only its hash is stored. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The active reviewer this token belongs to, or null. */
export function findReviewer(reviewers: Reviewer[], token: string): Reviewer | null {
  if (!token || token.length > 200) return null;
  const hash = Buffer.from(hashToken(token), "hex");
  for (const r of reviewers) {
    const stored = Buffer.from(r.tokenHash, "hex");
    if (stored.length === hash.length && timingSafeEqual(stored, hash)) {
      return r.active ? r : null;
    }
  }
  return null;
}

export const INVALID_LINK = "الرابط غير صالح أو أُوقف.";

// ---------------------------------------------------------------------------
// Which issue is under review
// ---------------------------------------------------------------------------

export type DraftState =
  | { kind: "draft"; issue: NewsletterIssue }
  | { kind: "published"; number: number }
  | { kind: "none" };

/** The newest draft. With none, says whether the newest issue just went out. */
export function draftState(newsletters: NewsletterIssue[]): DraftState {
  const newest = [...newsletters].sort((a, b) => b.number - a.number);
  const draft = newest.find((n) => n.status === "draft");
  if (draft) return { kind: "draft", issue: draft };
  if (newest[0]?.status === "published") return { kind: "published", number: newest[0].number };
  return { kind: "none" };
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

export const ITEM_GONE = "هذا الخبر أُزيل من المسودة.";

export interface ReviewerSaveInput {
  /** New values, by field. Anything outside the role's fields is ignored. */
  fields: Partial<Record<string, unknown>>;
  /** Content checker only: the card's news is recent. */
  fresh?: boolean;
}

function byIdMap(contributions: Contribution[]): Map<string, Contribution> {
  return new Map(contributions.map((c) => [c.id, c]));
}

function locate(issue: NewsletterIssue, itemId: string) {
  for (const section of issue.sections) {
    const item = section.items.find((i) => i.id === itemId);
    if (item) return { sectionId: section.id as SectionId, item };
  }
  return null;
}

function assertDraft(issue: NewsletterIssue) {
  if (issue.status !== "draft") {
    throw new NewsletterError("نُشر العدد، لا توجد مسودة للمراجعة الآن.", 409);
  }
}

function emptyReview(): ItemReview {
  return { by: {}, edits: [], fresh: null };
}

/**
 * One reviewer's save of one card, applied to the stored issue. Only the
 * role's own fields are read from the input; the rest of the card is the
 * stored copy, untouched. Returns the new issue and the saved card.
 */
export function applyReviewerSave(
  stored: NewsletterIssue,
  db: Pick<Database, "contributions">,
  reviewer: Reviewer,
  itemId: string,
  input: ReviewerSaveInput,
  now = new Date().toISOString(),
): { issue: NewsletterIssue; item: NewsletterItem } {
  assertDraft(stored);
  const found = locate(stored, itemId);
  if (!found || !roleSees(reviewer.role, found.sectionId)) {
    throw new NewsletterError(ITEM_GONE, 409);
  }
  const { sectionId, item } = found;
  const allowed = editableFields(reviewer.role, sectionId);

  const patch: Record<string, unknown> = {};
  const edits: ReviewEdit[] = [];
  for (const field of allowed) {
    if (!(field in input.fields)) continue;
    const value = str(input.fields[field], FIELD_MAX[field]);
    const previous = fieldValue(item, field);
    if (value === previous) continue;
    if (field === "source.url") patch.source = { url: value };
    else patch[field] = value;
    edits.push({
      reviewerId: reviewer.id,
      name: reviewer.name,
      role: reviewer.role,
      field,
      previous,
      value,
      at: now,
    });
  }

  const mark = { reviewerId: reviewer.id, name: reviewer.name, at: now };
  const review = item.review ?? emptyReview();
  const edited = Object.keys(patch).length > 0 ? applyItemEdit(item, patch, sectionId) : item;
  const next: NewsletterItem = {
    ...edited,
    review: {
      by: { ...review.by, [reviewer.role]: mark },
      edits: [...review.edits, ...edits],
      fresh: reviewer.role === "content" && input.fresh ? mark : review.fresh,
    },
  };

  const issue = validateIssue(
    {
      ...stored,
      sections: stored.sections.map((s) => ({
        ...s,
        items: s.items.map((i) => (i.id === itemId ? next : i)),
      })),
    },
    byIdMap(db.contributions),
  );
  return { issue, item: locate(issue, itemId)!.item };
}

/**
 * The content checker's "غير حديث": the card leaves the draft for the unused
 * list, with who decided. The host can put it back from the editor.
 */
export function applyStale(
  stored: NewsletterIssue,
  db: Pick<Database, "contributions">,
  reviewer: Reviewer,
  itemId: string,
): NewsletterIssue {
  assertDraft(stored);
  if (reviewer.role !== "content") {
    throw new NewsletterError("هذا الإجراء لمدقق المحتوى فقط.", 403);
  }
  const found = locate(stored, itemId);
  if (!found) throw new NewsletterError(ITEM_GONE, 409);
  const { item } = found;
  const c = db.contributions.find((x) => x.id === item.contributionId);

  return validateIssue(
    {
      ...stored,
      sections: stored.sections.map((s) => ({
        ...s,
        items: s.items.filter((i) => i.id !== itemId),
      })),
      unused: [
        ...stored.unused.filter((u) => u.contributionId !== item.contributionId),
        {
          contributionId: item.contributionId,
          title: c?.title ?? item.title,
          memberName: item.contributor.memberName,
          category: c ? effectiveCategory(c) : item.category,
          editorialScore: item.editorialScore,
          reason: "stale",
          detail: `غير حديث، حدّده ${reviewer.name}.`,
        },
      ],
    },
    byIdMap(db.contributions),
  );
}

// ---------------------------------------------------------------------------
// What the reviewer's page receives
// ---------------------------------------------------------------------------

export interface ReviewCard {
  item: Omit<NewsletterItem, "review" | "aiNotes" | "contributor">;
  editable: ReviewField[];
  fresh: boolean;
}

export interface ReviewSectionView {
  id: SectionId;
  title: string;
  cards: ReviewCard[];
}

export function reviewCard(
  reviewer: Reviewer,
  sectionId: SectionId,
  item: NewsletterItem,
): ReviewCard {
  // The host's audit trail and the member's identity stay with the host.
  const { review, aiNotes, contributor, ...rest } = item;
  return {
    item: rest,
    editable: [...editableFields(reviewer.role, sectionId)],
    fresh: Boolean(review?.fresh),
  };
}

/** The draft as one role sees it: its sections only, nothing from the admin side. */
export function reviewSections(issue: NewsletterIssue, reviewer: Reviewer): ReviewSectionView[] {
  return issue.sections
    .filter((s) => roleSees(reviewer.role, s.id))
    .map((s) => ({
      id: s.id,
      title: s.title,
      cards: s.items.map((i) => reviewCard(reviewer, s.id, i)),
    }));
}
