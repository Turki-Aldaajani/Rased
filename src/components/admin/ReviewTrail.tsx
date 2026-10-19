"use client";

import type { ReviewerRole } from "@/lib/db/schema";
import type { ItemReview, NewsletterIssue } from "@/lib/newsletter/types";
import { FIELD_LABELS, ROLES, reviewProgress, type ReviewField } from "@/lib/review/roles";

const fieldLabel = (f: string) => FIELD_LABELS[f as ReviewField] ?? f;

/** Top of the editor: how far each review task has got on this draft. */
export function ReviewSummary({ issue }: { issue: NewsletterIssue }) {
  const progress = reviewProgress(issue).filter((p) => p.total > 0);
  if (progress.length === 0) return null;
  return (
    <div className="mt-4 border-t border-border pt-3">
      <p className="text-xs text-muted-foreground">حالة المراجعة</p>
      <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {progress.map((p) => (
          <li key={p.role} className="text-foreground">
            {p.label}:{" "}
            <span className="tabular-nums">
              {p.reviewed} من {p.total}
            </span>
            {p.reviewed < p.total && (
              <span className="text-muted-foreground"> · بقي {p.total - p.reviewed}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Under a card: who reviewed it and what they changed, in one line, with the
 * earlier values a click away.
 */
export function ItemReviewLine({ review }: { review: ItemReview | undefined }) {
  if (!review) return null;
  const roles = Object.keys(review.by) as ReviewerRole[];
  if (roles.length === 0 && review.edits.length === 0) return null;

  const parts = roles.map((role) => {
    const mark = review.by[role]!;
    const fields = [
      ...new Set(review.edits.filter((e) => e.role === role).map((e) => fieldLabel(e.field))),
    ];
    const did = fields.length > 0 ? ` · عدّل ${fields.map((f) => `«${f}»`).join("، ")}` : "";
    const fresh = role === "content" && review.fresh ? " · حديث" : "";
    return `${mark.name} (${ROLES[role].short})${did}${fresh}`;
  });

  return (
    <details className="px-5 pb-3 text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none">راجعه: {parts.join(" · ")}</summary>
      {review.edits.length > 0 && (
        <ul className="mt-2 space-y-2 border-s border-border ps-3">
          {[...review.edits].reverse().map((e, i) => (
            <li key={i}>
              <p>
                {e.name} ({ROLES[e.role].short}) عدّل «{fieldLabel(e.field)}» ·{" "}
                {new Date(e.at).toLocaleString("ar")}
              </p>
              <p className="mt-0.5 break-words">
                كان: <span className="text-foreground">{e.previous || "فارغ"}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
