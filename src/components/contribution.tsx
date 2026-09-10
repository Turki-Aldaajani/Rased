import Link from "next/link";
import type { ReactNode } from "react";
import type {
  Contribution,
  ContributionType,
  DuplicateStatus,
  VerificationStatus,
} from "@/lib/db/schema";
import { effectiveDuplicate, effectiveScore } from "@/lib/db/schema";
import { relativeTime } from "@/lib/util/date";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export const TYPE_LABELS: Record<ContributionType, string> = {
  "AI News": "أخبار الذكاء الاصطناعي",
  "AI Tool": "أداة ذكاء اصطناعي",
  "Research / Paper": "بحث / ورقة علمية",
  Project: "مشروع",
  "AI Use Case": "حالة استخدام",
  "Learning Resource": "مصدر تعليمي",
  Other: "أخرى",
};

export function typeLabel(type: string): string {
  return TYPE_LABELS[type as ContributionType] ?? type;
}

export function ScoreRing({
  score,
  size = 64,
  label = "نقطة",
}: {
  score: number;
  size?: number;
  label?: string;
}) {
  const stroke = size < 60 ? 3 : 4;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, score)) / 100;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-label={`${score} من 100 ${label}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke="var(--border)"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke="var(--primary)"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - filled)}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="font-semibold leading-none tabular-nums text-foreground"
          style={{ fontSize: size * 0.3 }}
        >
          {score}
        </span>
      </div>
    </div>
  );
}

/**
 * A status dot plus quiet text. The state colour appears on the dot only —
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

const VERIFICATION_META: Record<
  VerificationStatus,
  { text: string; color: string }
> = {
  verified: { text: "موثّق", color: "var(--success)" },
  partial: { text: "موثّق جزئيًا", color: "var(--warning)" },
  unverified: { text: "غير موثّق", color: "var(--destructive)" },
};

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

export const DUPLICATE_META: Record<
  DuplicateStatus,
  { text: string; color: string }
> = {
  original: { text: "أصلي", color: "var(--success)" },
  partial: { text: "تكرار جزئي", color: "var(--warning)" },
  duplicate: { text: "تكرار", color: "var(--destructive)" },
};

/** "Original" is the norm, so it says nothing unless asked to. */
export function DuplicateBadge({
  status,
  always = false,
}: {
  status: DuplicateStatus;
  always?: boolean;
}) {
  if (status === "original" && !always) return null;
  const meta = DUPLICATE_META[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <StatusDot color={meta.color} />
      {meta.text}
    </span>
  );
}

export function TypePill({ type }: { type: string }) {
  return <Badge>{typeLabel(type)}</Badge>;
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
  const score = effectiveScore(contribution);
  const dup = effectiveDuplicate(contribution);

  return (
    <Link
      href={`/result/${contribution.id}`}
      className={cn(
        "flex items-start gap-4 rounded-md px-3 py-3 transition-colors duration-200 hover:bg-muted",
        className,
      )}
    >
      <span className="w-8 shrink-0 pt-0.5 text-end text-sm font-semibold tabular-nums text-foreground">
        {score}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground">
          {contribution.title}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {showMember && (
            <span className="text-foreground">{contribution.memberName}</span>
          )}
          <span>{typeLabel(contribution.type)}</span>
          <span aria-hidden>·</span>
          <span>{relativeTime(contribution.createdAt)}</span>
          {dup !== "original" && <DuplicateBadge status={dup} />}
          {contribution.adminOverride?.score != null && (
            <span>بتعديل من المضيف</span>
          )}
        </span>
      </span>
    </Link>
  );
}
