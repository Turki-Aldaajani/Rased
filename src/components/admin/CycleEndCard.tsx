"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import type { CycleEndMove, CycleSchedule } from "@/lib/services/cycle";
import { contributionsCount } from "@/lib/util/ar";
import {
  cycleLabel,
  formatDate,
  formatDayUtc,
  setCycleEndOverrides,
} from "@/lib/util/date";

type Request = { action: "set"; end: string } | { action: "reset-previous" };

/**
 * Where the host moves the current cycle's last day (issue #19). A change
 * that carries contributions across the boundary is shown in full and only
 * saved on a second, explicit confirmation.
 */
export function CycleEndCard({
  passcode,
  onChange,
}: {
  passcode: string;
  /** The calendar changed: labels and cycle keys elsewhere need a reload. */
  onChange: () => void;
}) {
  const [schedule, setSchedule] = useState<CycleSchedule | null>(null);
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState<{
    request: Request;
    moves: CycleEndMove[];
  } | null>(null);

  const adopt = useCallback(
    (next: CycleSchedule) => {
      // Client-side labels (cycleLabel) read the same overrides as the server.
      setCycleEndOverrides(next.overrides);
      setSchedule(next);
      setEnd(next.end);
      onChange();
    },
    [onChange],
  );

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/cycle", {
        cache: "no-store",
        headers: { "x-admin-passcode": passcode },
      });
      if (res.ok) adopt(((await res.json()) as { schedule: CycleSchedule }).schedule);
    })();
  }, [passcode, adopt]);

  async function submit(request: Request, confirmMoves?: number) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/cycle", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "x-admin-passcode": passcode,
        },
        body: JSON.stringify({ ...request, confirmMoves }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        schedule?: CycleSchedule;
        needsConfirmation?: boolean;
        moves?: CycleEndMove[];
        error?: string;
      };
      if (res.status === 409 && data.needsConfirmation) {
        setPending({ request, moves: data.moves ?? [] });
        return;
      }
      if (!res.ok || !data.schedule) {
        setError(data.error ?? "لم يُحفظ التعديل.");
        return;
      }
      setPending(null);
      adopt(data.schedule);
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  if (!schedule) {
    return (
      <SpotlightCard>
        <div className="px-5 py-4 text-sm text-muted-foreground">
          جارٍ تحميل موعد نهاية الدورة…
        </div>
      </SpotlightCard>
    );
  }

  const unchanged = end === schedule.end;

  return (
    <SpotlightCard>
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">
          تاريخ نهاية الدورة الحالية
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          الدورة الحالية {cycleLabel(schedule.cycle)}.{" "}
          {schedule.overridden
            ? `عُدِّل تاريخ نهايتها، والمعادلة الافتراضية كانت ستنهيها في ${formatDayUtc(schedule.defaultEnd)}.`
            : "تتبع المعادلة الافتراضية (14 يومًا من نقطة الانطلاق)."}
        </p>
      </div>

      <div className="space-y-4 px-5 py-4">
        <p className="text-sm text-foreground" aria-live="polite">
          تُصفَّر نقاط هذه الدورة مع بداية{" "}
          <strong className="font-semibold">{formatDayUtc(schedule.resetOn)}</strong>{" "}
          (منتصف الليل بتوقيت UTC).
        </p>

        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit({ action: "set", end });
          }}
        >
          <div className="min-w-48 flex-1 space-y-1.5">
            <Label htmlFor="cycle-end">آخر يوم في الدورة الحالية</Label>
            <Input
              id="cycle-end"
              type="date"
              value={end}
              min={schedule.minEnd}
              max={schedule.maxEnd}
              disabled={busy || pending !== null}
              onChange={(e) => {
                setEnd(e.target.value);
                setSaved(false);
              }}
            />
          </div>
          <Button type="submit" size="sm" disabled={busy || unchanged || !end || pending !== null}>
            حفظ
          </Button>
          {schedule.overridden && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy || pending !== null}
              onClick={() => void submit({ action: "set", end: schedule.defaultEnd })}
            >
              إرجاع للافتراضي
            </Button>
          )}
        </form>

        <p className="text-xs text-muted-foreground">
          الدورة التالية تبدأ {formatDayUtc(schedule.next.start)} وتنتهي{" "}
          {formatDayUtc(schedule.next.end)} كما في المعادلة، ثم تعود الدورات
          بعدها لطولها المعتاد دون أي إزاحة.
        </p>

        {schedule.previous && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              عُدِّلت نهاية الدورة السابقة إلى {formatDayUtc(schedule.previous.end)}{" "}
              (الافتراضي {formatDayUtc(schedule.previous.defaultEnd)}).
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy || pending !== null}
              onClick={() => void submit({ action: "reset-previous" })}
            >
              ألغِ تعديل الدورة السابقة
            </Button>
          </div>
        )}

        {saved && (
          <p className="text-sm text-muted-foreground">حُفظ الموعد الجديد.</p>
        )}
        {error && (
          <p className="text-sm" style={{ color: "var(--destructive)" }}>
            {error}
          </p>
        )}

        {pending && (
          <div
            role="alert"
            className="space-y-3 rounded-md border p-4"
            style={{ borderColor: "var(--destructive)" }}
          >
            <p className="text-sm font-semibold" style={{ color: "var(--destructive)" }}>
              هذا التعديل ينقل {contributionsCount(pending.moves.length)} إلى دورة
              أخرى
            </p>
            <p className="text-sm text-muted-foreground">
              ستُحتسب في الدورة الجديدة على لوحة المتصدرين. النقاط والبونص
              الممنوحة لها تبقى كما مُنحت، الذي يتغيّر هو الدورة التي تُحسب فيها
              فقط.
            </p>
            <ul className="divide-y divide-border text-sm">
              {pending.moves.map((m) => (
                <li key={m.id} className="py-2">
                  <p className="text-foreground">{m.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.memberName} · {formatDate(m.createdAt)} · من دورة{" "}
                    {m.fromLabel} إلى دورة {m.toLabel}
                  </p>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => void submit(pending.request, pending.moves.length)}
              >
                تأكيد الحفظ
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setPending(null);
                  setEnd(schedule.end);
                }}
              >
                إلغاء
              </Button>
            </div>
          </div>
        )}
      </div>
    </SpotlightCard>
  );
}
