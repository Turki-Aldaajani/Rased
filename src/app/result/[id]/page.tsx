import Link from "next/link";
import { notFound } from "next/navigation";
import {
  DuplicateBadge,
  ScoreRing,
  TypePill,
  VerificationBadge,
  scoreColor,
} from "@/components/ui";
import { DIMENSION_LABELS, SCORING } from "@/lib/config/scoring";
import { effectiveDuplicate, effectiveScore } from "@/lib/db/schema";
import { getContribution } from "@/lib/db/store";
import { formatDate } from "@/lib/util/date";
import { hostname } from "@/lib/util/text";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function ResultPage({ params }: Props) {
  const { id } = await params;
  const c = await getContribution(id);
  if (!c) notFound();

  const e = c.evaluation;
  const score = effectiveScore(c);
  const duplicate = effectiveDuplicate(c);
  const overridden = c.adminOverride?.score != null;
  const original = e.duplicateOfId
    ? await getContribution(e.duplicateOfId)
    : null;

  const dimensions = (
    Object.keys(SCORING.maxPoints) as (keyof typeof SCORING.maxPoints)[]
  ).map((key) => ({
    key,
    label: DIMENSION_LABELS[key],
    value: e.breakdown[key],
    max: SCORING.maxPoints[key],
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link href="/dashboard" className="btn-ghost btn-sm">
          ← Dashboard
        </Link>
        <Link href="/" className="btn-primary btn-sm">
          Add another find
        </Link>
      </div>

      {/* Headline result */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-start gap-5 p-6">
          <ScoreRing score={score} size={92} />
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <TypePill type={c.type} />
              <VerificationBadge status={e.verified} />
              <DuplicateBadge status={duplicate} />
            </div>
            <h1 className="text-xl font-bold leading-snug text-ink">
              {c.title}
            </h1>
            <p className="mt-1.5 text-sm text-muted">
              Submitted by{" "}
              <Link href={`/profile/${c.memberId}`} className="link">
                {c.memberName}
              </Link>{" "}
              · {formatDate(c.createdAt)}
            </p>
            <p className="mt-3 text-2xl font-bold" style={{ color: scoreColor(score) }}>
              {score}
              <span className="text-base font-semibold text-muted"> / 100</span>
            </p>
          </div>
        </div>

        <div className="border-t border-line bg-brand-soft px-6 py-4">
          <p className="text-sm leading-relaxed text-ink">{e.reason}</p>
        </div>
      </section>

      {overridden && (
        <section
          className="rounded-xl border px-5 py-4"
          style={{
            borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)",
            background: "var(--accent-soft)",
          }}
        >
          <p className="text-sm font-bold text-accent-ink">
            Adjusted by the host
          </p>
          <p className="mt-1 text-sm text-ink">
            The automatic score was {e.finalScore}. It was changed to {score}.
            {c.adminOverride?.note ? ` “${c.adminOverride.note}”` : ""}
          </p>
        </section>
      )}

      {/* Verification facts */}
      <section className="card p-6">
        <h2 className="section-title">Verification</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold text-muted">Status</dt>
            <dd className="mt-1.5">
              <VerificationBadge status={e.verified} />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted">
              Original publication date
            </dt>
            <dd className="mt-1.5 text-sm font-semibold text-ink">
              {formatDate(e.originalDate)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-semibold text-muted">Submitted source</dt>
            <dd className="mt-1.5 truncate text-sm">
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer noopener"
                className="link"
              >
                {hostname(c.url) || c.url}
              </a>
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-semibold text-muted">
              Original / official source
            </dt>
            <dd className="mt-1.5 truncate text-sm">
              {e.resolvedSource ? (
                <a
                  href={e.resolvedSource}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="link"
                >
                  {hostname(e.resolvedSource) || e.resolvedSource}
                </a>
              ) : (
                <span className="text-muted">Not identified</span>
              )}
            </dd>
          </div>
        </dl>

        {e.evidence.length > 0 && (
          <ul className="mt-5 space-y-2 border-t border-line pt-4">
            {e.evidence.map((line, i) => (
              <li key={i} className="flex gap-2 text-sm text-muted">
                <span aria-hidden className="text-brand-ink">
                  ·
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Duplicate check */}
      <section className="card p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">Duplicate check</h2>
          <DuplicateBadge status={duplicate} />
        </div>
        <p className="mt-3 text-sm leading-relaxed text-ink">
          {e.duplicateReason ?? "No duplicate information recorded."}
        </p>
        {original && (
          <Link
            href={`/result/${original.id}`}
            className="mt-4 flex items-center gap-3 rounded-lg border border-line p-3 transition-colors hover:bg-brand-soft"
          >
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-soft text-sm font-bold text-brand-ink">
              {effectiveScore(original)}
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-muted">
                First submitted by {original.memberName} on{" "}
                {formatDate(original.createdAt)}
              </span>
              <span className="block truncate text-sm font-semibold text-ink">
                {original.title}
              </span>
            </span>
          </Link>
        )}
      </section>

      {/* Score breakdown */}
      <section className="card p-6">
        <h2 className="section-title">Score breakdown</h2>
        <ul className="mt-4 space-y-3.5">
          {dimensions.map((d) => (
            <li key={d.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-ink">{d.label}</span>
                <span className="font-mono text-xs text-muted">
                  <span className="text-sm font-bold text-ink">{d.value}</span>/
                  {d.max}
                </span>
              </div>
              <div className="meter mt-1.5">
                <span style={{ width: `${(d.value / d.max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-5 space-y-1.5 border-t border-line pt-4 text-sm">
          <div className="flex justify-between text-muted">
            <span>Subtotal</span>
            <span className="font-mono">{e.rawScore} / 100</span>
          </div>
          {e.rawScore !== e.finalScore && (
            <div className="flex justify-between text-muted">
              <span>After verification &amp; duplicate adjustment</span>
              <span className="font-mono">{e.finalScore} / 100</span>
            </div>
          )}
          <div className="flex justify-between pt-1 text-base font-bold text-ink">
            <span>Final score</span>
            <span style={{ color: scoreColor(score) }}>{score} / 100</span>
          </div>
        </div>
      </section>

      {/* What the member wrote */}
      <section className="card p-6">
        <h2 className="section-title">What {c.memberName} submitted</h2>
        <dl className="mt-4 space-y-4 text-sm">
          <div>
            <dt className="text-xs font-semibold text-muted">
              What did you find?
            </dt>
            <dd className="mt-1 whitespace-pre-wrap leading-relaxed text-ink">
              {c.description || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted">
              Why is this useful?
            </dt>
            <dd className="mt-1 whitespace-pre-wrap leading-relaxed text-ink">
              {c.whyUseful || "—"}
            </dd>
          </div>
        </dl>
      </section>

      <p className="pb-2 text-center text-xs text-muted">
        {e.engine === "ai"
          ? `Evaluated by ${e.model} with live web verification.`
          : "Evaluated by the offline heuristic — set ANTHROPIC_API_KEY for AI-verified scoring."}
      </p>
    </div>
  );
}
