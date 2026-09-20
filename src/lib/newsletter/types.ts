import type {
  Audience,
  Difficulty,
  NewsletterCategory,
} from "@/lib/db/schema";
import type { SectionId } from "./sections";

/**
 * A newsletter issue is structured data first. The HTML page is only ever a
 * rendering of this, so an issue can be edited, validated, re-rendered and
 * re-published without anyone touching markup.
 *
 * Nothing in here carries member points. Items are ordered and selected by
 * the editorial score alone.
 */

export type ReviewSeverity = "warning" | "info";

export interface ReviewFlag {
  code: string;
  severity: ReviewSeverity;
  message: string;
}

export interface ItemSource {
  /** Publication or site name, e.g. "OpenAI". */
  name: string;
  /** The contribution's URL, never written by the model. */
  url: string;
  /** Optional link text when it should differ from the source name. */
  linkText: string;
  /** Original publication date, when the evaluation found one. */
  publishedAt: string | null;
}

export interface NewsletterItem {
  id: string;
  /** Every item comes from a contribution; this is how it is traced back. */
  contributionId: string;

  title: string;
  /** One line for the numbered list at the top of "أهم الأخبار". */
  headline: string;
  /** Small label above the lead story, e.g. "الخبر الأهم". */
  kicker: string;
  paragraphs: string[];
  /**
   * "لماذا يهمك؟" is the member's own text, printed word for word. The model
   * is not asked for it and cannot overwrite it; only an editor can.
   */
  whyItMatters: string;

  /** Tools: the audience pill beside the name, e.g. "للمطورين". */
  chip: string;
  fitLabel: string;
  fitText: string;
  ideaLabel: string;
  idea: string;
  exampleLabel: string;
  example: string;
  note: string;

  /** Social: the takeaway line ("المغزى: …"). */
  moral: string;
  /** Social: where it is being discussed, e.g. "Reddit". */
  platform: string;

  /** Learn: author or organisation. */
  byline: string;
  levelLabel: string;
  difficulty: Difficulty | null;
  prerequisites: string[];
  audience: Audience[];

  ctaLabel: string;
  source: ItemSource;

  /** Traceability, shown in the admin area, not on the public page. */
  contributor: { memberId: string; memberName: string };
  category: NewsletterCategory;
  editorialScore: number;

  /** Who wrote the current text. */
  writtenBy: "ai" | "source" | "editor";
  /** Things the model itself said it could not support. Editors clear them. */
  aiNotes: string[];
  /** Recomputed on every save, see validate.ts. */
  flags: ReviewFlag[];
}

export interface NewsletterSection {
  id: SectionId;
  title: string;
  items: NewsletterItem[];
  /** Last generation error for this section, if any. */
  error: string | null;
}

export type UnusedReason =
  | "below_threshold"
  | "section_full"
  | "same_event"
  | "duplicate_url"
  | "removed_by_editor";

export interface UnusedContribution {
  contributionId: string;
  title: string;
  memberName: string;
  category: NewsletterCategory | null;
  editorialScore: number;
  reason: UnusedReason;
  detail: string;
}

export type IssueStatus = "draft" | "published";

export interface Publication {
  url: string;
  at: string;
  target: "github" | "filesystem";
  /** Path written, relative to the newsletter root, e.g. "02/index.html". */
  path: string;
  /** 1 on first publish, bumped on every intentional re-publish. */
  version: number;
}

export interface NewsletterIssue {
  id: string;
  number: number;
  cycleKey: string;
  cycleStart: string; // YYYY-MM-DD
  cycleEnd: string; // YYYY-MM-DD
  status: IssueStatus;

  /** Hero title, lead and closing, Issue #1's defaults, editable. */
  title: string;
  lead: string;
  closing: string;

  sections: NewsletterSection[];
  unused: UnusedContribution[];

  generation: {
    engine: "ai" | "source";
    model: string | null;
    at: string;
    /** Section-level failures from the last run. The draft is kept either way. */
    errors: string[];
  };

  createdAt: string;
  updatedAt: string;

  publication: Publication | null;
  /** True when a published issue was edited and not yet re-published. */
  editedAfterPublish: boolean;
}

/** Issues that exist on GitHub Pages but predate the engine. */
export interface LegacyIssue {
  number: number;
  cycleKey: string;
  title: string;
  lead: string;
  monthLabel: string;
  monthIso: string;
  url: string;
  path: string;
}
