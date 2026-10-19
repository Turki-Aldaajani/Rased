import { randomUUID } from "crypto";
import { REVIEWER_ROLES, type Reviewer, type ReviewerRole } from "@/lib/db/schema";
import { mutate, readDb, updateIssue } from "@/lib/db/store";
import { NewsletterError } from "@/lib/newsletter/errors";
import { previewHtml } from "@/lib/newsletter/service";
import type { NewsletterItem, ReviewFlag } from "@/lib/newsletter/types";
import { cycleLabel } from "@/lib/util/date";
import {
  INVALID_LINK,
  applyReviewerSave,
  applyStale,
  draftState,
  findReviewer,
  generateToken,
  hashToken,
  reviewCard,
  reviewSections,
  type ReviewCard,
  type ReviewSectionView,
  type ReviewerSaveInput,
} from "./core";
import { ROLES } from "./roles";

// ---------------------------------------------------------------------------
// Host side: managing reviewers
// ---------------------------------------------------------------------------

/** A reviewer as the admin page sees it; the token hash never leaves the server. */
export type PublicReviewer = Omit<Reviewer, "tokenHash">;

function publicReviewer({ tokenHash, ...rest }: Reviewer): PublicReviewer {
  return rest;
}

export async function listReviewers(): Promise<PublicReviewer[]> {
  const db = await readDb();
  return [...db.reviewers]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(publicReviewer);
}

export function isReviewerRole(value: unknown): value is ReviewerRole {
  return REVIEWER_ROLES.includes(value as ReviewerRole);
}

/** Adds a reviewer and returns the one copy of their token there will ever be. */
export async function addReviewer(
  name: string,
  role: ReviewerRole,
): Promise<{ reviewer: PublicReviewer; token: string }> {
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new NewsletterError("اكتب اسم المراجع.", 400);
  const token = generateToken();
  const reviewer: Reviewer = {
    id: randomUUID(),
    name: clean,
    role,
    tokenHash: hashToken(token),
    active: true,
    createdAt: new Date().toISOString(),
    lastSeenAt: null,
  };
  await mutate((db) => {
    db.reviewers.push(reviewer);
  });
  return { reviewer: publicReviewer(reviewer), token };
}

/** A new link; the old one stops working at once. Also re-activates a stopped reviewer. */
export async function rotateReviewer(
  id: string,
): Promise<{ reviewer: PublicReviewer; token: string }> {
  const token = generateToken();
  const reviewer = await mutate((db) => {
    const r = db.reviewers.find((x) => x.id === id);
    if (!r) return null;
    r.tokenHash = hashToken(token);
    r.active = true;
    return { ...r };
  });
  if (!reviewer) throw new NewsletterError("المراجع غير موجود.", 404);
  return { reviewer: publicReviewer(reviewer), token };
}

/** Stops the reviewer's link. Their past edits stay on the cards. */
export async function stopReviewer(id: string): Promise<PublicReviewer> {
  const reviewer = await mutate((db) => {
    const r = db.reviewers.find((x) => x.id === id);
    if (!r) return null;
    r.active = false;
    return { ...r };
  });
  if (!reviewer) throw new NewsletterError("المراجع غير موجود.", 404);
  return publicReviewer(reviewer);
}

// ---------------------------------------------------------------------------
// Reviewer side: the personal link
// ---------------------------------------------------------------------------

async function authenticate(token: string): Promise<Reviewer> {
  const db = await readDb();
  const reviewer = findReviewer(db.reviewers, token);
  if (!reviewer) throw new NewsletterError(INVALID_LINK, 401);
  return reviewer;
}

/** Re-checked under the lock, so a link stopped mid-request writes nothing. */
function stillValid(reviewers: Reviewer[], token: string): Reviewer {
  const reviewer = findReviewer(reviewers, token);
  if (!reviewer) throw new NewsletterError(INVALID_LINK, 401);
  return reviewer;
}

/** Last visit, written at most every few minutes so a page load is not a write. */
const SEEN_EVERY_MS = 5 * 60 * 1000;

async function touch(reviewer: Reviewer): Promise<void> {
  const last = reviewer.lastSeenAt ? Date.parse(reviewer.lastSeenAt) : 0;
  if (Date.now() - last < SEEN_EVERY_MS) return;
  await mutate((db) => {
    const r = db.reviewers.find((x) => x.id === reviewer.id);
    if (r) r.lastSeenAt = new Date().toISOString();
  });
}

export interface ReviewPage {
  reviewer: { name: string; role: ReviewerRole; label: string; task: string };
  state: "draft" | "published" | "none";
  issue: {
    number: number;
    title: string;
    cycleLabel: string;
    sections: ReviewSectionView[];
  } | null;
}

export async function reviewPage(token: string): Promise<ReviewPage> {
  const reviewer = await authenticate(token);
  await touch(reviewer);
  const db = await readDb();
  const state = draftState(db.newsletters);
  const def = ROLES[reviewer.role];
  return {
    reviewer: { name: reviewer.name, role: reviewer.role, label: def.label, task: def.task },
    state: state.kind,
    issue:
      state.kind === "draft"
        ? {
            number: state.issue.number,
            title: state.issue.title,
            cycleLabel: cycleLabel(state.issue.cycleKey),
            sections: reviewSections(state.issue, reviewer),
          }
        : null,
  };
}

async function currentDraftId(): Promise<string> {
  const state = draftState((await readDb()).newsletters);
  if (state.kind !== "draft") {
    throw new NewsletterError("نُشر العدد، لا توجد مسودة للمراجعة الآن.", 409);
  }
  return state.issue.id;
}

export interface ReviewSaveResult {
  card: ReviewCard;
  /** validate.ts on the saved card, so the reviewer sees what the host will. */
  flags: ReviewFlag[];
}

export async function saveAsReviewer(
  token: string,
  itemId: string,
  input: ReviewerSaveInput,
): Promise<ReviewSaveResult> {
  await authenticate(token);
  const issueId = await currentDraftId();
  const saved: { card?: ReviewCard; item?: NewsletterItem } = {};
  const issue = await updateIssue(issueId, (stored, db) => {
    const reviewer = stillValid(db.reviewers, token);
    const out = applyReviewerSave(stored, db, reviewer, itemId, input);
    const section = out.issue.sections.find((s) => s.items.some((i) => i.id === itemId))!;
    saved.item = out.item;
    saved.card = reviewCard(reviewer, section.id, out.item);
    return out.issue;
  });
  if (!issue || !saved.card || !saved.item) throw new NewsletterError("العدد غير موجود.", 404);
  return { card: saved.card, flags: saved.item.flags };
}

export async function markStale(token: string, itemId: string): Promise<void> {
  await authenticate(token);
  const issueId = await currentDraftId();
  await updateIssue(issueId, (stored, db) =>
    applyStale(stored, db, stillValid(db.reviewers, token), itemId),
  );
}

/** The whole draft as it will be published, read-only, with the draft ribbon. */
export async function reviewerPreview(token: string): Promise<string> {
  await authenticate(token);
  return previewHtml(await currentDraftId());
}
