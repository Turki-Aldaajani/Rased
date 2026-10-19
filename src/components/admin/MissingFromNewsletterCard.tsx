"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { categoryLabel } from "@/components/contribution";
import { Button } from "@/components/ui/button";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import type { MissingCycle, MissingItem } from "@/lib/newsletter/manual";
import { SECTIONS, sectionForCategory, type SectionId } from "@/lib/newsletter/sections";
import { cn } from "@/lib/utils";

const SELECT_CLASS =
  "h-9 cursor-pointer rounded-md border border-input bg-card px-2 text-sm text-foreground transition-colors duration-200 hover:border-border-strong focus-visible:border-ring focus-visible:outline-none";

/**
 * «لم تدخل النشرة»: every accepted contribution that sits in no issue of its
 * own cycle, under that cycle's name, with a one-click add into that issue.
 * A host's add skips the editorial floor and needs no evaluation.
 */
export function MissingFromNewsletterCard({
  passcode,
  refreshKey,
}: {
  passcode: string;
  /** Changes whenever the page reloads its contributions, so this list follows. */
  refreshKey: unknown;
}) {
  const [cycles, setCycles] = useState<MissingCycle[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const headers = useCallback(
    () => ({ "Content-Type": "application/json", "x-admin-passcode": passcode }),
    [passcode],
  );

  useEffect(() => {
    let live = true;
    fetch("/api/newsletters/missing", { cache: "no-store", headers: headers() })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { cycles?: MissingCycle[] } | null) => {
        if (live && body?.cycles) setCycles(body.cycles);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [headers, refreshKey]);

  async function add(cycle: MissingCycle, item: MissingItem, sectionId: SectionId) {
    const published = cycle.issue?.status === "published";
    if (
      published &&
      !window.confirm(
        `العدد ${cycle.issue!.number} منشور. الإضافة تعديل عليه، وتحتاج إعادة نشره بعدها. متابعة؟`,
      )
    ) {
      return;
    }
    setBusy(item.contributionId);
    setMessage(null);
    try {
      const res = await fetch("/api/newsletters/missing", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          contributionId: item.contributionId,
          sectionId,
          confirmPublishedEdit: published,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        cycles?: MissingCycle[];
        issueNumber?: number;
        regenerateError?: string | null;
      };
      if (!res.ok) {
        setMessage(body.error ?? "لم تنجح الإضافة.");
        return;
      }
      if (body.cycles) setCycles(body.cycles);
      setMessage(
        body.regenerateError ??
          (published
            ? `أُضيفت «${item.title}» إلى العدد ${body.issueNumber}. أعد نشره لتظهر الإضافة.`
            : `أُضيفت «${item.title}» إلى العدد ${body.issueNumber}.`),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <SpotlightCard className="p-5">
      <h2 className="text-sm font-semibold text-foreground">لم تدخل النشرة</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        مساهمات مقبولة لم تُضف إلى عدد دورتها.
      </p>

      {message && <p className="mt-3 text-sm text-muted-foreground">{message}</p>}

      {cycles === null ? (
        <p className="mt-4 text-sm text-muted-foreground">جارٍ التحميل…</p>
      ) : cycles.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          كل المساهمات المقبولة داخل أعداد دوراتها.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          {cycles.map((cycle) => (
            <section key={cycle.cycleKey}>
              <div className="flex items-center gap-3">
                <span className="shrink-0 text-xs text-muted-foreground">
                  دورة {cycle.label}
                </span>
                <span className="h-px flex-1 bg-border" aria-hidden />
              </div>
              <ul className="divide-y divide-border">
                {cycle.items.map((item) => (
                  <MissingRow
                    key={item.contributionId}
                    item={item}
                    cycleKey={cycle.cycleKey}
                    hasIssue={cycle.issue !== null}
                    busy={busy}
                    onAdd={(sectionId) => add(cycle, item, sectionId)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </SpotlightCard>
  );
}

function MissingRow({
  item,
  cycleKey,
  hasIssue,
  busy,
  onAdd,
}: {
  item: MissingItem;
  cycleKey: string;
  hasIssue: boolean;
  busy: string | null;
  onAdd: (sectionId: SectionId) => void;
}) {
  const [sectionId, setSectionId] = useState<SectionId | "">(
    item.category ? sectionForCategory(item.category).id : "",
  );
  const adding = busy === item.contributionId;

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 flex-1">
        <Link
          href={`/result/${item.contributionId}`}
          className="block truncate text-sm text-foreground hover:underline"
        >
          {item.title}
        </Link>
        <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          <span className="text-foreground">{item.memberName}</span>
          <span>{categoryLabel(item.category)}</span>
          <span>{item.reason}</span>
        </p>
      </div>
      {hasIssue ? (
        <div className="flex shrink-0 items-center gap-2">
          <select
            className={cn(SELECT_CLASS, "min-w-0 flex-1 sm:flex-none")}
            value={sectionId}
            aria-label="القسم"
            onChange={(e) => setSectionId(e.target.value as SectionId)}
          >
            {!item.category && (
              <option value="" disabled>
                اختر القسم
              </option>
            )}
            {SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!sectionId || busy !== null}
            onClick={() => sectionId && onAdd(sectionId)}
          >
            {adding ? <Loader2 className="animate-spin" /> : null}
            أضف للنشرة
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" disabled>
            أضف للنشرة
          </Button>
          <Link
            href={`/admin/newsletter?cycle=${cycleKey}`}
            className="text-xs text-foreground underline-offset-4 hover:underline"
          >
            أنشئ عدد هذه الدورة
          </Link>
        </div>
      )}
    </li>
  );
}
