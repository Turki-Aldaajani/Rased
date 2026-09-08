import Link from "next/link";
import type { ReactNode } from "react";
import type {
  Contribution,
  DuplicateStatus,
  VerificationStatus,
} from "@/lib/db/schema";
import { effectiveDuplicate, effectiveScore } from "@/lib/db/schema";
import { relativeTime } from "@/lib/util/date";

export const MEDALS = ["🥇", "🥈", "🥉"];

export function rankBadge(rank: number): string {
  return MEDALS[rank - 1] ?? `${rank}.`;
}

/** Score → state colour. Green good, amber middling, red weak. */
export function scoreColor(score: number): string {
  if (score >= 75) return "var(--success)";
  if (score >= 45) return "var(--warning)";
  return "var(--error)";
}

export function ScoreRing({
  score,
  size = 72,
  label = "points",
}: {
  score: number;
  size?: number;
  label?: string;
}) {
  const stroke = size < 60 ? 5 : 6;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, score)) / 100;
  const color = scoreColor(score);

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-label={`${score} out of 100 ${label}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke="color-mix(in srgb, var(--muted) 25%, transparent)"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - filled)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-bold leading-none"
          style={{ fontSize: size * 0.3, color }}
        >
          {score}
        </span>
      </div>
    </div>
  );
}

const VERIFICATION_META: Record<
  VerificationStatus,
  { icon: string; text: string; color: string }
> = {
  verified: { icon: "✅", text: "Verified", color: "var(--success)" },
  partial: { icon: "⚠️", text: "Partially verified", color: "var(--warning)" },
  unverified: { icon: "❌", text: "Could not verify", color: "var(--error)" },
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
      className="pill"
      style={{
        color: meta.color,
        background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
      }}
    >
      <span aria-hidden>{meta.icon}</span>
      {!compact && meta.text}
    </span>
  );
}

const DUPLICATE_META: Record<
  DuplicateStatus,
  { text: string; color: string }
> = {
  original: { text: "Original", color: "var(--success)" },
  partial: { text: "Partially duplicate", color: "var(--warning)" },
  duplicate: { text: "Duplicate", color: "var(--error)" },
};

export function DuplicateBadge({ status }: { status: DuplicateStatus }) {
  const meta = DUPLICATE_META[status];
  return (
    <span
      className="pill"
      style={{
        color: meta.color,
        background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
      }}
    >
      {meta.text}
    </span>
  );
}

export function TypePill({ type }: { type: string }) {
  return (
    <span className="pill bg-brand-soft text-brand-ink">{type}</span>
  );
}

export function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="card p-4">
      <p className="section-title">{label}</p>
      <p className="mt-2 text-2xl font-bold text-ink">{value}</p>
      {sub != null && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
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
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-base font-semibold text-ink">{title}</p>
      <p className="max-w-sm text-sm text-muted">{body}</p>
      {action}
    </div>
  );
}

/** One row in a list of contributions. */
export function ContributionRow({
  contribution,
  showMember = true,
}: {
  contribution: Contribution;
  showMember?: boolean;
}) {
  const score = effectiveScore(contribution);
  const dup = effectiveDuplicate(contribution);
  return (
    <Link
      href={`/result/${contribution.id}`}
      className="flex items-start gap-3 rounded-lg border border-transparent px-3 py-3 transition-colors hover:border-line hover:bg-brand-soft"
    >
      <span
        className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-bold"
        style={{
          color: scoreColor(score),
          background: `color-mix(in srgb, ${scoreColor(score)} 12%, transparent)`,
        }}
      >
        {score}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">
          {contribution.title}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {showMember && (
            <span className="font-semibold text-interactive-ink">
              {contribution.memberName}
            </span>
          )}
          <span>{contribution.type}</span>
          <span aria-hidden>·</span>
          <span>{relativeTime(contribution.createdAt)}</span>
          {dup !== "original" && (
            <span
              className="font-semibold"
              style={{ color: DUPLICATE_META[dup].color }}
            >
              {DUPLICATE_META[dup].text}
            </span>
          )}
          {contribution.adminOverride?.score != null && (
            <span className="font-semibold text-accent-ink">admin-adjusted</span>
          )}
        </span>
      </span>
    </Link>
  );
}
