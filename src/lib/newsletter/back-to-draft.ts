import { NewsletterError } from "./errors";
import type { NewsletterIssue } from "./types";

/**
 * Taking a published issue back to a draft, so the team's reviewers can work
 * on it again: their links only ever open the newest draft.
 *
 * Only the record changes. The public page stays exactly as it was until the
 * issue is published again, and the publication is kept on the issue so that
 * next publish replaces the same folder instead of refusing it as taken.
 */

/** Why this issue may not go back to a draft, or null when it may. */
export function backToDraftRefusal(
  issue: NewsletterIssue | undefined,
  all: NewsletterIssue[],
): NewsletterError | null {
  if (!issue) return new NewsletterError("العدد غير موجود.", 404);
  if (issue.status !== "published") {
    return new NewsletterError("العدد مسودة بالفعل.", 409);
  }
  // Reviewers' links open one draft. A second would leave them on the other.
  const other = all.find((n) => n.id !== issue.id && n.status === "draft");
  if (other) {
    return new NewsletterError(
      `توجد مسودة أخرى (العدد ${other.number}). انشرها أو احذفها أولًا، فروابط المراجعين تفتح مسودة واحدة فقط.`,
      409,
      { issueId: other.id },
    );
  }
  return null;
}

/** The same issue as a draft. The publication stays, see the note above. */
export function asDraft(issue: NewsletterIssue): NewsletterIssue {
  return { ...issue, status: "draft", editedAfterPublish: false };
}

/** Why this issue may not be deleted, or null when it may. */
export function deleteRefusal(issue: NewsletterIssue): NewsletterError | null {
  if (issue.status === "published") return new NewsletterError("لا يُحذف عدد منشور.", 409);
  // Back to a draft, its page is still public: deleting it would free the
  // number and leave that page with no issue behind it.
  if (issue.publication) {
    return new NewsletterError("سبق نشر هذا العدد وصفحته ما زالت منشورة، فلا يُحذف.", 409);
  }
  return null;
}

/**
 * True when publishing this issue replaces a page that is already public:
 * it is published, or it was and went back to a draft.
 */
export function replacesPublishedPage(issue: Pick<NewsletterIssue, "status" | "publication">): boolean {
  return issue.status === "published" || issue.publication !== null;
}
