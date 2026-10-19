"use client";

import { Copy, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { REVIEWER_ROLES, type ReviewerRole } from "@/lib/db/schema";
import { ROLES } from "@/lib/review/roles";
import type { PublicReviewer } from "@/lib/review/service";
import { cn } from "@/lib/utils";

const SELECT_CLASS =
  "h-9 cursor-pointer rounded-md border border-input bg-card px-2 text-sm text-foreground transition-colors duration-200 hover:border-border-strong focus-visible:border-ring focus-visible:outline-none";

/**
 * «المراجعون»: people who review the draft through a personal link, each in
 * one role. The server keeps only a hash of each link, so a link is shown
 * when it is made; to hand it out again later, issue a new one.
 */
export function ReviewersCard({ passcode }: { passcode: string }) {
  const [reviewers, setReviewers] = useState<PublicReviewer[] | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState<ReviewerRole>("insight");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /** Links issued in this visit, by reviewer id. Gone on reload, by design. */
  const [links, setLinks] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const headers = useCallback(
    () => ({ "Content-Type": "application/json", "x-admin-passcode": passcode }),
    [passcode],
  );

  useEffect(() => {
    let live = true;
    fetch("/api/reviewers", { cache: "no-store", headers: headers() })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { reviewers?: PublicReviewer[] } | null) => {
        if (live && body?.reviewers) setReviewers(body.reviewers);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [headers]);

  async function call(url: string, method: string, body: unknown, key: string) {
    setBusy(key);
    setMessage(null);
    try {
      const res = await fetch(url, { method, headers: headers(), body: JSON.stringify(body) });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        reviewers?: PublicReviewer[];
        reviewer?: PublicReviewer;
        token?: string;
      };
      if (!res.ok) {
        setMessage(payload.error ?? "لم تنجح العملية.");
        return null;
      }
      if (payload.reviewers) setReviewers(payload.reviewers);
      if (payload.reviewer && payload.token) {
        const link = `${window.location.origin}/review/${payload.token}`;
        setLinks((l) => ({ ...l, [payload.reviewer!.id]: link }));
      }
      return payload;
    } finally {
      setBusy(null);
    }
  }

  async function add() {
    const done = await call("/api/reviewers", "POST", { name, role }, "add");
    if (done) {
      setName("");
      setMessage("أُضيف المراجع. انسخ رابطه الآن، فهو لا يظهر مرة أخرى.");
    }
  }

  async function copy(id: string) {
    const link = links[id];
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    } catch {
      setMessage("تعذّر النسخ، انسخ الرابط يدويًا.");
    }
  }

  return (
    <SpotlightCard className="p-5">
      <h2 className="text-sm font-semibold text-foreground">المراجعون</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        روابط شخصية لمراجعة مسودة العدد الحالي، كلٌّ في دوره، دون كلمة مرور الإدارة.
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input
          value={name}
          placeholder="اسم المراجع"
          aria-label="اسم المراجع"
          onChange={(e) => setName(e.target.value)}
          className="sm:flex-1"
        />
        <select
          className={SELECT_CLASS}
          value={role}
          aria-label="الدور"
          onChange={(e) => setRole(e.target.value as ReviewerRole)}
        >
          {REVIEWER_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLES[r].label}
            </option>
          ))}
        </select>
        <Button size="sm" className="h-9" onClick={add} disabled={busy !== null || !name.trim()}>
          {busy === "add" ? <Loader2 className="animate-spin" /> : null}
          أضف مراجعًا
        </Button>
      </div>

      {message && <p className="mt-3 text-sm text-muted-foreground">{message}</p>}

      {reviewers === null ? (
        <p className="mt-4 text-sm text-muted-foreground">جارٍ التحميل…</p>
      ) : reviewers.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">لا يوجد مراجعون بعد.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {reviewers.map((r) => (
            <li key={r.id} className="py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm", r.active ? "text-foreground" : "text-muted-foreground")}>
                    {r.name}
                    {!r.active && " · موقوف"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {ROLES[r.role].label}
                    {r.lastSeenAt
                      ? ` · آخر دخول ${new Date(r.lastSeenAt).toLocaleDateString("ar")}`
                      : " · لم يدخل بعد"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {links[r.id] && (
                    <Button size="sm" variant="outline" onClick={() => copy(r.id)}>
                      <Copy />
                      {copied === r.id ? "نُسخ" : "نسخ الرابط"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() =>
                      call(`/api/reviewers/${r.id}`, "PATCH", { action: "rotate" }, `rot-${r.id}`)
                    }
                  >
                    {busy === `rot-${r.id}` ? <Loader2 className="animate-spin" /> : null}
                    {r.active ? "تجديد الرابط" : "إعادة التفعيل برابط جديد"}
                  </Button>
                  {r.active && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() =>
                        call(`/api/reviewers/${r.id}`, "PATCH", { action: "stop" }, `stop-${r.id}`)
                      }
                      style={{ color: "var(--destructive)" }}
                    >
                      إيقاف
                    </Button>
                  )}
                </div>
              </div>
              {links[r.id] && (
                <p className="mt-2 break-all text-xs text-muted-foreground" dir="ltr">
                  {links[r.id]}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </SpotlightCard>
  );
}
