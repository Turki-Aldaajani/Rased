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

/**
 * One field as the reviewer sends it: the new value, and the value the page
 * showed when they started editing. The base is how a save tells whether
 * someone else changed the field in the meantime.
 */
export interface FieldEdit {
  value: string;
  base: string;
}

export interface ReviewerSaveInput {
  /** By field. Anything outside the role's fields, or without a base, is ignored. */
  fields: Partial<Record<string, unknown>>;
  /** Content checker only: the card's news is recent. */
  fresh?: boolean;
}

/** A field that was not saved because it changed since the reviewer opened it. */
export interface FieldConflict {
  field: ReviewField;
  /** The value in the store now, for the reviewer to decide on. */
  current: string;
  message: string;
}

function asFieldEdit(raw: unknown): FieldEdit | null {
  if (!raw || typeof raw !== "object") return null;
  const { value, base } = raw as Record<string, unknown>;
  if (typeof value !== "string" || typeof base !== "string") return null;
  return { value, base };
}

/** Who last changed this field: the reviewer who did, or the host when no reviewer did. */
function lastEditor(item: NewsletterItem, field: ReviewField, current: string): string {
  const edit = [...(item.review?.edits ?? [])]
    .reverse()
    .find((e) => e.field === field);
  return edit && edit.value === current ? edit.name : "المحرر";
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
 * stored copy, untouched, so two roles saving the same card in any order
 * both keep their changes. A field someone changed since the reviewer opened
 * it is refused on its own and handed back as a conflict.
 */
export function applyReviewerSave(
  stored: NewsletterIssue,
  db: Pick<Database, "contributions">,
  reviewer: Reviewer,
  itemId: string,
  input: ReviewerSaveInput,
  now = new Date().toISOString(),
): { issue: NewsletterIssue; item: NewsletterItem; conflicts: FieldConflict[] } {
  assertDraft(stored);
  const found = locate(stored, itemId);
  if (!found || !roleSees(reviewer.role, found.sectionId)) {
    throw new NewsletterError(ITEM_GONE, 409);
  }
  const { sectionId, item } = found;
  const allowed = editableFields(reviewer.role, sectionId);

  const patch: Record<string, unknown> = {};
  const edits: ReviewEdit[] = [];
  const conflicts: FieldConflict[] = [];
  for (const field of allowed) {
    const sent = asFieldEdit(input.fields[field]);
    if (!sent) continue;
    const value = str(sent.value, FIELD_MAX[field]);
    const previous = fieldValue(item, field);
    if (value === previous) continue;
    // Field level, under the lock: what decides is this field's stored value
    // against the one the reviewer started from, never the rest of the card.
    if (str(sent.base, FIELD_MAX[field]) !== previous) {
      conflicts.push({
        field,
        current: previous,
        message: `عدّل ${lastEditor(item, field, previous)} هذا الحقل قبل قليل.`,
      });
      continue;
    }
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
  // A save with a conflict is not a finished review of the card yet.
  const done = conflicts.length === 0;
  const next: NewsletterItem = {
    ...edited,
    review: {
      by: done ? { ...review.by, [reviewer.role]: mark } : review.by,
      edits: [...review.edits, ...edits],
      fresh: done && reviewer.role === "content" && input.fresh ? mark : review.fresh,
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
  return { issue, item: locate(issue, itemId)!.item, conflicts };
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
