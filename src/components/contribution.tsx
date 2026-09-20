import Link from "next/link";
import type { ReactNode } from "react";
import type {
  Audience,
  Contribution,
  ContributionStatus,
  Difficulty,
  DuplicateOutcome,
  NewsletterCategory,
  VerificationStatus,
} from "@/lib/db/schema";
import {
  editorialScore,
  effectiveBonus,
  effectiveCategory,
  effectivePoints,
  effectiveStatus,
} from "@/lib/db/schema";
import { formatPoints } from "@/lib/util/ar";
import { SECTION_TITLE_BY_CATEGORY } from "@/lib/newsletter/sections";
import { relativeTime } from "@/lib/util/date";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

/**
 * The newsletter's own section names, taken from Issue #1 via
 * `lib/newsletter/sections.ts` so the app and the published page always agree.
 */
export const CATEGORY_LABELS: Record<NewsletterCategory, string> =
  SECTION_TITLE_BY_CATEGORY;

export const CATEGORY_HINTS: Record<NewsletterCategory, string> = {
  important_news: "أخبار الذكاء الاصطناعي التي يجب أن يعرفها الفريق",
  new_models: "إطلاق أو تحديث نموذج",
  new_tools: "أداة أو منتج جديد فعلًا",
  other_tools: "أداة مفيدة ليست جديدة، أو تحديث مهم",
  learn_this_week: "شروحات ودورات وأوراق وكل ما يُتعلَّم منه",
  social_trends: "ما يتحدث عنه مجتمع الذكاء الاصطناعي",
};

export function categoryLabel(c: NewsletterCategory | null): string {
  return c ? CATEGORY_LABELS[c] : "بلا تصنيف";
}

export const AUDIENCE_LABELS: Record<Audience, string> = {
  beginners: "المبتدئون",
  university_students: "طلاب الجامعة",
  developers: "المطورون",
  ai_engineers: "مهندسو الذكاء الاصطناعي",
  data_scientists: "علماء البيانات",
  researchers: "الباحثون",
  designers: "المصممون",
  entrepreneurs: "رواد الأعمال",
  content_creators: "صنّاع المحتوى",
  general_users: "المستخدم العام",
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  beginner: "مبتدئ",
  intermediate: "متوسط",
  advanced: "متقدم",
  not_applicable: "لا ينطبق",
};

export const STATUS_META: Record<
  ContributionStatus,
  { text: string; color: string; hint: string }
> = {
  accepted: {
    text: "مقبولة",
    color: "var(--success)",
    hint: "مساهمة صحيحة وجديدة",
  },
  accepted_with_new_angle: {
    text: "مقبولة بزاوية جديدة",
    color: "var(--success)",
    hint: "موضوع معروف، لكن المساهمة تضيف قيمة جديدة",
  },
  duplicate: {
    text: "مكررة",
    color: "var(--warning)",
    hint: "سبق إرسال المحتوى نفسه",
  },
  rejected: {
    text: "مرفوضة",
    color: "var(--destructive)",
    hint: "لم تستوفِ الحد الأدنى للقبول",
  },
  pending: {
    text: "بانتظار التقييم",
    color: "var(--info)",
    hint: "تعذّر الوصول إلى المقيّم، المساهمة محفوظة ويمكن إعادة المحاولة",
  },
  blocked_source: {
    text: "بانتظار المراجعة اليدوية",
    color: "var(--accent)",
    hint: "المصدر يمنع الوصول الآلي، تنتظر مراجعة المضيف",
  },
};

export const DUPLICATE_META: Record<
  DuplicateOutcome,
  { text: string; color: string }
> = {
  unique: { text: "فريدة", color: "var(--success)" },
  same_topic_new_value: { text: "نفس الموضوع بقيمة جديدة", color: "var(--warning)" },
  duplicate: { text: "مكررة", color: "var(--destructive)" },
};

export const VERIFICATION_META: Record<
  VerificationStatus,
  { text: string; color: string }
> = {
  verified: { text: "تم التحقق", color: "var(--success)" },
  partially_verified: { text: "تحقق جزئي", color: "var(--warning)" },
  not_independently_verified: {
    text: "لم يُتحقق منه بشكل مستقل",
    color: "var(--muted-foreground)",
  },
};

/**
 * A status dot plus quiet text. The state colour appears on the dot only,
 * enough to read at a glance, not enough to colour the page.
 */
function StatusDot({ color }: { color: string }) {
  return (
    <span
      className="h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ background: color }}
      aria-hidden
    />
  );
}

export function StatusBadge({
  status,
  compact = false,
}: {
  status: ContributionStatus;
  compact?: boolean;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      title={meta.hint}
    >
      <StatusDot color={meta.color} />
      {!compact && meta.text}
    </span>
  );
}

export function VerificationBadge({
  status,
  compact = false,
}: {
  status: VerificationStatus;
  compact?: boolean;
}) {
  const meta = VERIFICATION_META[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      title={meta.text}
    >
      <StatusDot color={meta.color} />
      {!compact && meta.text}
    </span>
  );
}

/** "Unique" is the norm, so it says nothing unless asked to. */
export function DuplicateBadge({
  outcome,
  always = false,
}: {
  outcome: DuplicateOutcome;
  always?: boolean;
}) {
  if (outcome === "unique" && !always) return null;
  const meta = DUPLICATE_META[outcome];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <StatusDot color={meta.color} />
      {meta.text}
    </span>
  );
}

export function CategoryPill({
  category,
}: {
  category: NewsletterCategory | null;
}) {
  return <Badge>{categoryLabel(category)}</Badge>;
}

/**
 * The member-facing number. Always 0 or 1, a contribution point, never the
 * editorial score, which lives in its own clearly-labelled place.
 */
export function PointsBadge({
  points,
  size = "md",
}: {
  points: number;
  size?: "sm" | "md" | "lg";
}) {
  const earned = points > 0;
  const dim = size === "lg" ? 64 : size === "sm" ? 32 : 44;
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full border"
      style={{
        width: dim,
        height: dim,
        borderColor: earned ? "var(--primary)" : "var(--border)",
        color: earned ? "var(--primary)" : "var(--muted-foreground)",
      }}
      aria-label={earned ? `نقطة واحدة` : "بلا نقاط"}
    >
      <span
        className="font-semibold leading-none tabular-nums"
        style={{ fontSize: dim * 0.32 }}
      >
        {earned ? `+${points}` : "0"}
      </span>
    </div>
  );
}

/**
 * Editorial value, for the newsletter. Rendered as a quiet meter rather than
 * a score ring on purpose: it must never read like the member's points.
 */
export function EditorialMeter({
  score,
  className,
}: {
  score: number;
  className?: string;
}) {
  return (
    <div className={cn("min-w-32", className)}>
      <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
        <span>القيمة التحريرية</span>
        <span className="tabular-nums">{score}/100</span>
      </div>
      <div className="meter mt-1.5">
        <span style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      {action}
    </Card>
  );
}

/** One row in a list of contributions. */
export function ContributionRow({
  contribution,
  showMember = true,
  className,
}: {
  contribution: Contribution;
  showMember?: boolean;
  className?: string;
}) {
  const points = effectivePoints(contribution);
  const bonus = effectiveBonus(contribution);
  const status = effectiveStatus(contribution);
  const category = effectiveCategory(contribution);
  const total = points + bonus;

  return (
    <Link
      href={`/result/${contribution.id}`}
      className={cn(
        "flex items-start gap-4 rounded-md px-3 py-3 transition-colors duration-200 hover:bg-muted",
        className,
      )}
    >
      <span
        className="w-10 shrink-0 pt-0.5 text-end text-sm font-semibold tabular-nums"
        style={{ color: total > 0 ? "var(--primary)" : "var(--muted-foreground)" }}
      >
        {total > 0 ? `+${formatPoints(total)}` : "0"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground">
          {contribution.title}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {showMember && (
            <span className="text-foreground">{contribution.memberName}</span>
          )}
          <span>{categoryLabel(category)}</span>
          <span aria-hidden>·</span>
          <span>{relativeTime(contribution.createdAt)}</span>
          <StatusBadge status={status} />
          {contribution.evaluation && (
            <span title="القيمة التحريرية للنشرة، ليست نقاط العضو">
              تحريريًا {editorialScore(contribution)}
            </span>
          )}
          {bonus > 0 && (
            <span title="بونص مؤكَّد على نص العضو">
              بونص +{formatPoints(bonus)}
            </span>
          )}
          {contribution.bonus?.status === "pending" && (
            <span title="اقترحه رصد وينتظر تأكيد المضيف">
              بونص بانتظار التأكيد
            </span>
          )}
          {contribution.adminOverride && <span>بتعديل من المضيف</span>}
        </span>
      </span>
    </Link>
  );
}
