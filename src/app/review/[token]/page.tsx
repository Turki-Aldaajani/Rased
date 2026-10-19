"use client";

import { Eye, Loader2, Save } from "lucide-react";
import { use, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { SECTIONS, type SectionId, type SectionKind } from "@/lib/newsletter/sections";
import type { ReviewFlag } from "@/lib/newsletter/types";
import type { FieldConflict, ReviewCard } from "@/lib/review/core";
import {
  HINT_FIELDS,
  hintCounter,
  insightLengthHint,
  savedWarning,
  type InsightHint,
} from "@/lib/review/hint";
import {
  FIELD_LABELS,
  INSIGHT_RULE,
  fieldGuide,
  writesInsight,
  type ReviewField,
} from "@/lib/review/roles";
import type { ReviewPage } from "@/lib/review/service";
import { cn } from "@/lib/utils";

const INSIGHT_LABEL = "ما وراء الخبر بزاوية راصد";

const kindOf = (id: SectionId): SectionKind => SECTIONS.find((s) => s.id === id)!.kind;

type Values = Partial<Record<ReviewField, string>>;

function valuesOf(card: ReviewCard): Values {
  const item = card.item;
  return Object.fromEntries(
    card.editable.map((f) => [f, f === "source.url" ? item.source.url : item[f]]),
  );
}

function pick(values: Values, keys: string[]): Values {
  return Object.fromEntries(keys.map((k) => [k, values[k as ReviewField] ?? ""]));
}

/**
 * A reviewer's personal page: the current draft, only the sections their
 * role covers, and only their own fields open for editing. Everything else
 * is the card as it reads in the newsletter, for context.
 */
export default function ReviewerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [page, setPage] = useState<ReviewPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/review/${token}`, { cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as ReviewPage & {
      error?: string;
    };
    if (!res.ok) {
      setError(body.error ?? "تعذّر تحميل المسودة.");
      return;
    }
    setError(null);
    setPage(body);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return <Card className="mx-auto max-w-2xl p-5 text-sm text-muted-foreground">{error}</Card>;
  }
  if (!page) {
    return (
      <Card className="mx-auto max-w-2xl p-5 text-sm text-muted-foreground">جارٍ التحميل…</Card>
    );
  }

  const { reviewer, issue } = page;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card className="p-5">
        <p className="text-xs text-muted-foreground">{reviewer.label}</p>
        <h1 className="mt-1 text-lg font-semibold text-foreground">أهلًا {reviewer.name}</h1>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">{reviewer.task}</p>
        {writesInsight(reviewer.role) && (
          <p className="mt-3 border-s-2 border-border ps-3 text-sm leading-7 text-foreground">
            {INSIGHT_RULE}
          </p>
        )}
        {issue && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <span className="text-sm text-foreground">
              العدد {issue.number}
              <span className="text-muted-foreground"> · دورة {issue.cycleLabel}</span>
            </span>
            <Button asChild variant="outline" size="sm" className="ms-auto">
              <a href={`/api/review/${token}/preview`} target="_blank" rel="noreferrer noopener">
                <Eye />
                معاينة العدد كاملًا
              </a>
            </Button>
          </div>
        )}
      </Card>

      {!issue ? (
        <Card className="p-5 text-sm text-muted-foreground">
          {page.state === "published"
            ? "نُشر العدد، لا توجد مسودة للمراجعة الآن."
            : "لا توجد مسودة للمراجعة الآن."}
        </Card>
      ) : issue.sections.every((s) => s.cards.length === 0) ? (
        <Card className="p-5 text-sm text-muted-foreground">
          لا توجد بطاقات في أقسامك في هذه المسودة.
        </Card>
      ) : (
        issue.sections
          .filter((s) => s.cards.length > 0)
          .map((section) => (
            <section key={section.id} className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">{section.title}</h2>
              {section.cards.map((card) => (
                <ReviewCardView
                  key={card.item.id}
                  token={token}
                  sectionId={section.id}
                  initial={card}
                  isContent={reviewer.role === "content"}
                  onGone={load}
                />
              ))}
            </section>
          ))
      )}
    </div>
  );
}

function ReviewCardView({
  token,
  sectionId,
  initial,
  isContent,
  onGone,
}: {
  token: string;
  sectionId: SectionId;
  initial: ReviewCard;
  isContent: boolean;
  onGone: () => void;
}) {
  const [card, setCard] = useState(initial);
  const [values, setValues] = useState<Values>(() => valuesOf(initial));
  /** What each field held when this reviewer started on it; sent with every save. */
  const [base, setBase] = useState<Values>(() => valuesOf(initial));
  const [conflicts, setConflicts] = useState<Partial<Record<ReviewField, FieldConflict>>>({});
  /** The card left the draft while this page was open. */
  const [gone, setGone] = useState(false);
  const [flags, setFlags] = useState<ReviewFlag[] | null>(null);
  const [busy, setBusy] = useState<"save" | "fresh" | "stale" | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "hint" | "error" } | null>(
    null,
  );
  const [confirmStale, setConfirmStale] = useState(false);

  const saved = valuesOf(card);
  const dirty = card.editable.some((f) => (values[f] ?? "") !== (saved[f] ?? ""));
  const kind = kindOf(sectionId);
  const item = card.item;
  /** «ما وراء الخبر» is measured against the news the reviewer reads above it. */
  const newsText = item.paragraphs.join("\n");
  const hintFor = (f: ReviewField, text: string): InsightHint | null =>
    HINT_FIELDS.includes(f) && card.editable.includes(f)
      ? insightLengthHint(text, newsText, f)
      : null;

  async function save(fresh = false) {
    setBusy(fresh ? "fresh" : "save");
    setMessage(null);
    try {
      const res = await fetch(`/api/review/${token}/items/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: Object.fromEntries(
            card.editable.map((f) => [f, { value: values[f] ?? "", base: base[f] ?? "" }]),
          ),
          fresh,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        card?: ReviewCard;
        flags?: ReviewFlag[];
        conflicts?: FieldConflict[];
      };
      if (!res.ok || !body.card) {
        setMessage({ text: body.error ?? "تعذّر الحفظ.", tone: "error" });
        if (res.status === 409) setGone(true);
        if (res.status === 401) onGone();
        return;
      }
      // Every field comes back as the store has it now, others' changes
      // included, except a conflicted one: that keeps the reviewer's text
      // until they decide.
      const stored = valuesOf(body.card);
      const clash = Object.fromEntries((body.conflicts ?? []).map((c) => [c.field, c]));
      setCard(body.card);
      setValues((old) => ({ ...stored, ...pick(old, Object.keys(clash)) }));
      setBase((old) => ({ ...stored, ...pick(old, Object.keys(clash)) }));
      setConflicts(clash);
      setFlags(body.flags ?? []);
      // Saving is never blocked; a saved text that is longer than the news,
      // or restates it, gets one last mention here.
      const warnings = body.card.editable
        .map((f) => {
          const warning = savedWarning(hintFor(f, stored[f] ?? ""));
          return warning && `نص «${FIELD_LABELS[f]}» ${warning}`;
        })
        .filter(Boolean);
      setMessage(
        body.conflicts?.length
          ? { text: "لم يُحفظ كل شيء، راجع الحقل المعلَّم.", tone: "error" }
          : warnings.length > 0
            ? { text: `حُفظ، لكن ${warnings.join("، و")}.`, tone: "hint" }
            : { text: fresh ? "سُجّل: حديث." : "حُفظ.", tone: "ok" },
      );
    } finally {
      setBusy(null);
    }
  }

  async function stale() {
    setBusy("stale");
    setMessage(null);
    try {
      const res = await fetch(`/api/review/${token}/items/${item.id}/stale`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage({ text: body.error ?? "لم ينجح الإجراء.", tone: "error" });
        return;
      }
      onGone();
    } finally {
      setBusy(null);
      setConfirmStale(false);
    }
  }

  /** Take what is in the store now, or keep one's own text and save over it. */
  function resolve(f: ReviewField, keepMine: boolean) {
    const current = conflicts[f]!.current;
    if (!keepMine) setValues((v) => ({ ...v, [f]: current }));
    setBase((b) => ({ ...b, [f]: current }));
    setConflicts(({ [f]: _, ...rest }) => rest);
  }

  const field = (f: ReviewField, label = FIELD_LABELS[f]) => (
    <ReviewText
      key={f}
      conflict={conflicts[f]}
      hint={gone ? null : hintFor(f, values[f] ?? "")}
      onResolve={(keepMine) => resolve(f, keepMine)}
      label={label}
      guide={card.editable.includes(f) ? fieldGuide(sectionId, f) : null}
      value={
        card.editable.includes(f)
          ? (values[f] ?? "")
          : f === "source.url"
            ? item.source.url
            : item[f]
      }
      editable={card.editable.includes(f) && !gone}
      ltr={f === "source.url"}
      onChange={(v) => setValues((old) => ({ ...old, [f]: v }))}
    />
  );

  // Each family shows the parts it prints, in the order the newsletter prints them.
  const insight: ReviewField[] =
    kind === "story"
      ? ["whyItMatters"]
      : kind === "tool"
        ? ["fitText", "idea"]
        : kind === "learn"
          ? ["note", "fitText"]
          : ["moral"];

  return (
    <Card className="p-4 sm:p-5">
      {kind === "learn" && item.levelLabel && (
        <p className="text-xs text-muted-foreground">المستوى: {item.levelLabel}</p>
      )}
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-base font-semibold leading-7 text-foreground">{item.title}</h3>
        {kind === "tool" && item.chip && (
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
            {item.chip}
          </span>
        )}
      </div>
      {kind === "learn" && item.byline && (
        <p className="mt-1 text-xs text-muted-foreground">{item.byline}</p>
      )}
      <div className="mt-3 space-y-3 text-sm leading-7 text-foreground">
        {item.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {(kind === "tool" || kind === "learn") && item.example && (
        <div className="mt-3 text-sm leading-7">
          <p className="text-xs text-muted-foreground">{item.exampleLabel || "مثال"}</p>
          <p className="text-foreground">{item.example}</p>
        </div>
      )}

      <div className="mt-4 space-y-3 border-t border-border pt-3">
        <p className="text-xs font-semibold" style={{ color: "var(--gold-bright)" }}>
          {INSIGHT_LABEL}
        </p>
        {insight.map((f) =>
          f === "fitText" ? field(f, item.fitLabel || FIELD_LABELS.fitText) : field(f),
        )}
      </div>

      <div className="mt-4 border-t border-border pt-3">
        {isContent ? (
          field("source.url")
        ) : (
          <p className="break-all text-xs text-muted-foreground">
            المصدر: {item.source.name ? `${item.source.name} · ` : ""}
            <a
              href={item.source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-foreground underline-offset-4 hover:underline"
              dir="ltr"
            >
              {item.source.url}
            </a>
          </p>
        )}
        {item.source.publishedAt && (
          <p className="mt-1 text-xs text-muted-foreground">نُشر {item.source.publishedAt}</p>
        )}
      </div>

      {flags && flags.length > 0 && (
        <ul className="mt-3 space-y-1">
          {flags.map((f, i) => (
            <li
              key={i}
              className="text-xs"
              style={{
                color: f.severity === "warning" ? "var(--warning)" : "var(--muted-foreground)",
              }}
            >
              {f.message}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {card.editable.length > 0 && (
          <Button size="sm" onClick={() => save(false)} disabled={busy !== null || !dirty || gone}>
            {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />}
            حفظ
          </Button>
        )}
        {gone && (
          <Button size="sm" variant="outline" onClick={onGone}>
            حدّث الصفحة
          </Button>
        )}
        {isContent && !confirmStale && !gone && (
          <>
            <Button
              size="sm"
              variant={card.fresh ? "default" : "outline"}
              onClick={() => save(true)}
              disabled={busy !== null}
            >
              {busy === "fresh" ? <Loader2 className="animate-spin" /> : null}
              حديث
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmStale(true)}
              disabled={busy !== null}
            >
              غير حديث
            </Button>
          </>
        )}
        {isContent && confirmStale && (
          <>
            <span className="text-xs text-muted-foreground">يُخرج الخبر من المسودة.</span>
            <Button size="sm" variant="outline" onClick={stale} disabled={busy !== null}>
              {busy === "stale" ? <Loader2 className="animate-spin" /> : null}
              تأكيد: غير حديث
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmStale(false)}>
              تراجع
            </Button>
          </>
        )}
        {message && (
          <span
            className="text-xs"
            style={{
              color:
                message.tone === "ok"
                  ? "var(--success)"
                  : message.tone === "hint"
                    ? "var(--hint)"
                    : "var(--destructive)",
            }}
          >
            {message.text}
          </span>
        )}
      </div>
    </Card>
  );
}

/** Editable fields get a light frame; everything else reads as plain text. */
function ReviewText({
  label,
  value,
  editable,
  ltr,
  conflict,
  hint,
  guide,
  onChange,
  onResolve,
}: {
  label: string;
  /** What the field should say, e.g. a tool's «الفكرة» as a way to use it. */
  guide?: string | null;
  value: string;
  editable: boolean;
  ltr?: boolean;
  conflict?: FieldConflict;
  /** Length and repetition against the news; null for a field it does not apply to. */
  hint?: InsightHint | null;
  onChange: (value: string) => void;
  onResolve: (keepMine: boolean) => void;
}) {
  if (!editable) {
    if (!value.trim()) return null;
    return (
      <div className="text-sm leading-7">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-foreground", ltr && "break-all")} dir={ltr ? "ltr" : undefined}>
          {value}
        </p>
      </div>
    );
  }
  return (
    <div>
      <label className="block">
        <span className="text-xs text-muted-foreground">{label}</span>
        {guide && (
          <span className="mt-0.5 block text-xs leading-6 text-muted-foreground">{guide}</span>
        )}
        <Textarea
          dir={ltr ? "ltr" : undefined}
          className={cn("mt-1 text-sm leading-7", ltr ? "min-h-12 break-all" : "min-h-20")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      {hint && (
        <p
          className="mt-1 text-xs tabular-nums"
          style={{ color: hint.message ? "var(--hint)" : "var(--muted-foreground)" }}
        >
          {hintCounter(hint)}
          {/* Announced only when it changes from one advice to another, not on every word. */}
          <span aria-live="polite">{hint.message ? ` · ${hint.message}` : ""}</span>
        </p>
      )}
      {conflict && (
        <div className="mt-2 rounded-md border border-border p-3 text-xs leading-6" role="alert">
          <span className="block" style={{ color: "var(--warning)" }}>
            {conflict.message} لم يُحفظ نصك في هذا الحقل.
          </span>
          <span className="mt-1 block text-muted-foreground">القيمة الآن:</span>
          <span
            className={cn("block text-foreground", ltr && "break-all")}
            dir={ltr ? "ltr" : undefined}
          >
            {conflict.current || "فارغ"}
          </span>
          <span className="mt-2 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => onResolve(false)}>
              اعتمد القيمة الحالية
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => onResolve(true)}>
              أبقِ نصي ثم احفظ
            </Button>
          </span>
        </div>
      )}
    </div>
  );
}
