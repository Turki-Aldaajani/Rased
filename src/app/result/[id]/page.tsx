import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  DuplicateBadge,
  ScoreRing,
  TypePill,
  VerificationBadge,
} from "@/components/contribution";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href="/dashboard">
            <ArrowLeft />
            Dashboard
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/">Add another find</Link>
        </Button>
      </div>

      {/* Headline result */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start gap-5 p-5">
          <ScoreRing score={score} size={80} />
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <TypePill type={c.type} />
              <VerificationBadge status={e.verified} />
              <DuplicateBadge status={duplicate} always />
            </div>
            <h1 className="text-lg font-semibold leading-snug text-foreground">
              {c.title}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Submitted by{" "}
              <Link
                href={`/profile/${c.memberId}`}
                className="text-foreground underline-offset-4 hover:underline"
              >
                {c.memberName}
              </Link>{" "}
              · {formatDate(c.createdAt)}
            </p>
          </div>
        </div>

        <p className="border-t border-border bg-muted px-5 py-4 text-sm leading-relaxed text-foreground">
          {e.reason}
        </p>
      </Card>

      {overridden && (
        <Card className="p-5">
          <p className="text-sm font-semibold text-foreground">
            Adjusted by the host
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            The automatic score was {e.finalScore}. It was changed to {score}.
            {c.adminOverride?.note ? ` “${c.adminOverride.note}”` : ""}
          </p>
        </Card>
      )}

      {/* Verification facts */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-foreground">Verification</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Status</dt>
            <dd className="mt-1.5">
              <VerificationBadge status={e.verified} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              Original publication date
            </dt>
            <dd className="mt-1.5 text-sm text-foreground">
              {formatDate(e.originalDate)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Submitted source</dt>
            <dd className="mt-1.5 truncate text-sm">
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-foreground underline-offset-4 hover:underline"
              >
                {hostname(c.url) || c.url}
                <ExternalLink className="size-3 text-muted-foreground" />
              </a>
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">
              Original / official source
            </dt>
            <dd className="mt-1.5 truncate text-sm">
              {e.resolvedSource ? (
                <a
                  href={e.resolvedSource}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 text-foreground underline-offset-4 hover:underline"
                >
                  {hostname(e.resolvedSource) || e.resolvedSource}
                  <ExternalLink className="size-3 text-muted-foreground" />
                </a>
              ) : (
                <span className="text-muted-foreground">Not identified</span>
              )}
            </dd>
          </div>
        </dl>

        {e.evidence.length > 0 && (
          <ul className="mt-5 space-y-2 border-t border-border pt-4">
            {e.evidence.map((line, i) => (
              <li
                key={i}
                className="flex gap-2 text-sm text-muted-foreground before:content-['—']"
              >
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Duplicate check */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">
            Duplicate check
          </h2>
          <DuplicateBadge status={duplicate} always />
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {e.duplicateReason ?? "No duplicate information recorded."}
        </p>
        {original && (
          <Link
            href={`/result/${original.id}`}
            className="mt-4 flex items-center gap-3 rounded-md border border-border p-3 transition-colors duration-200 hover:bg-muted"
          >
            <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
              {effectiveScore(original)}
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground">
                First submitted by {original.memberName} on{" "}
                {formatDate(original.createdAt)}
              </span>
              <span className="block truncate text-sm text-foreground">
                {original.title}
              </span>
            </span>
          </Link>
        )}
      </Card>

      {/* Score breakdown */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-foreground">
          Score breakdown
        </h2>
        <ul className="mt-4 space-y-3.5">
          {dimensions.map((d) => (
            <li key={d.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-foreground">{d.label}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  <span className="text-sm text-foreground">{d.value}</span>/
                  {d.max}
                </span>
              </div>
              <div className="meter mt-1.5">
                <span style={{ width: `${(d.value / d.max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-5 space-y-1.5 border-t border-border pt-4 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span className="tabular-nums">{e.rawScore} / 100</span>
          </div>
          {e.rawScore !== e.finalScore && (
            <div className="flex justify-between text-muted-foreground">
              <span>After verification &amp; duplicate adjustment</span>
              <span className="tabular-nums">{e.finalScore} / 100</span>
            </div>
          )}
          <div className="flex justify-between pt-1 font-semibold text-foreground">
            <span>Final score</span>
            <span className="tabular-nums">{score} / 100</span>
          </div>
        </div>
      </Card>

      {/* What the member wrote */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-foreground">
          What {c.memberName} submitted
        </h2>
        <dl className="mt-4 space-y-4 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">What is it?</dt>
            <dd className="mt-1 whitespace-pre-wrap leading-relaxed text-foreground">
              {c.description || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              Why is this useful?
            </dt>
            <dd className="mt-1 whitespace-pre-wrap leading-relaxed text-foreground">
              {c.whyUseful || "—"}
            </dd>
          </div>
        </dl>
      </Card>

      <p className="pb-2 text-center text-xs text-muted-foreground">
        {e.engine === "ai"
          ? `Evaluated by ${e.model} with live web verification.`
          : "Evaluated by the offline heuristic — set ANTHROPIC_API_KEY for AI-verified scoring."}
      </p>
    </div>
  );
}
