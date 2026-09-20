"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AdminGate from "@/components/admin/AdminGate";
import { useAdminSession } from "@/components/admin/useAdminSession";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CycleOverview } from "@/lib/newsletter/service";
import type { LegacyIssue } from "@/lib/newsletter/types";
import { contributionsCount } from "@/lib/util/ar";

interface IssueSummary {
  id: string;
  number: number;
  cycleKey: string;
  cycleLabel: string;
  status: "draft" | "published";
  items: number;
  openWarnings: number;
  updatedAt: string;
  publication: { url: string; at: string; version: number } | null;
  editedAfterPublish: boolean;
  engine: "ai" | "source";
}

interface Listing {
  issues: IssueSummary[];
  legacy: LegacyIssue[];
  cycles: { key: string; label: string }[];
  currentCycle: string;
}

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground transition-colors duration-200 focus-visible:border-ring focus-visible:outline-none";

const REASON_LABELS: Record<string, string> = {
  below_threshold: "دون الحد التحريري",
  section_full: "القسم ممتلئ",
  same_event: "نفس الحدث",
  duplicate_url: "نفس الرابط",
  removed_by_editor: "أزاله المحرر",
};

export default function NewsletterAdminPage() {
  const { ready, authed, signIn, send } = useAdminSession();
  const [listing, setListing] = useState<Listing | null>(null);
  const [cycle, setCycle] = useState<string>("");
  const [overview, setOverview] = useState<CycleOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadListing = useCallback(async () => {
    const res = await send("/api/newsletters");
    if (!res.ok) return;
    const data = (await res.json()) as Listing;
    setListing(data);
    setCycle((c) => c || data.currentCycle);
  }, [send]);

  const loadOverview = useCallback(
    async (key: string) => {
      const res = await send(`/api/newsletters/overview?cycle=${key}`);
      if (res.ok) setOverview((await res.json()) as CycleOverview);
    },
    [send],
  );

  useEffect(() => {
    if (authed) void loadListing();
  }, [authed, loadListing]);

  useEffect(() => {
    if (authed && cycle) void loadOverview(cycle);
  }, [authed, cycle, loadOverview]);

  async function generate() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await send("/api/newsletters", {
        method: "POST",
        body: JSON.stringify({ cycle }),
      });
      const data = (await res.json()) as { issue?: { id: string }; error?: string };
      if (!res.ok) {
        setMessage(data.error ?? "تعذّر توليد العدد.");
        return;
      }
      window.location.href = `/admin/newsletter/${data.issue!.id}`;
    } finally {
      setBusy(false);
    }
  }

  const existing = overview?.issue;

  return (
    <AdminGate ready={ready} authed={authed} onSignIn={signIn}>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="font-serif-display text-xl font-semibold tracking-tight text-foreground">
              النشرة
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              اختر دورة، راجع تغطيتها، ثم ولّد مسودة. لا يُنشر شيء إلا بموافقتك.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm" className="ms-auto">
            <Link href="/admin">
              <ArrowRight />
              منطقة المضيف
            </Link>
          </Button>
        </div>

        {message && (
          <p className="text-sm" style={{ color: "var(--destructive)" }}>
            {message}
          </p>
        )}

        {/* Cycle picker + generate */}
        <Card className="p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-muted-foreground" htmlFor="cycle">
                دورة النشرة
              </label>
              <select
                id="cycle"
                className={`${SELECT_CLASS} mt-1.5`}
                value={cycle}
                onChange={(e) => setCycle(e.target.value)}
              >
                {(listing?.cycles ?? []).map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                    {c.key === listing?.currentCycle ? " (الحالية)" : ""}
                  </option>
                ))}
              </select>
            </div>
            {existing ? (
              existing.id ? (
                <Button asChild>
                  <Link href={`/admin/newsletter/${existing.id}`}>
                    افتح العدد {existing.number}
                  </Link>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  هذه الدورة يغطيها العدد {existing.number} المنشور سابقًا.
                </p>
              )
            ) : (
              <Button onClick={generate} disabled={busy || !overview?.eligible}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                ولّد العدد {overview?.nextNumber ?? ""}
              </Button>
            )}
            {overview && !overview.aiEnabled && (
              <p className="text-xs text-muted-foreground">
                لا يوجد ANTHROPIC_API_KEY، ستُجمَّع النصوص من بيانات المساهمات
                دون صياغة، وتُعلَّم للمراجعة.
              </p>
            )}
          </div>
        </Card>

        {overview && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="p-5">
                <p className="text-xs text-muted-foreground">مساهمات الدورة</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                  {overview.submissions}
                </p>
                <p className="text-xs text-muted-foreground">
                  {overview.eligible} صالحة للنشرة
                </p>
              </Card>
              <Card className="p-5">
                <p className="text-xs text-muted-foreground">المختار للعدد</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                  {overview.selected.length}
                </p>
                <p className="text-xs text-muted-foreground">
                  {overview.unused.length} خارج الاختيار
                </p>
              </Card>
              <Card className="p-5">
                <p className="text-xs text-muted-foreground">المساهمون</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                  {overview.contributors.length}
                </p>
                <p className="text-xs text-muted-foreground">في هذه الدورة</p>
              </Card>
            </div>

            {/* Coverage of the six sections */}
            <Card className="overflow-hidden">
              <div className="border-b border-border px-5 py-4">
                <h2 className="text-sm font-semibold text-foreground">
                  تغطية الأقسام
                </h2>
                <p className="text-xs text-muted-foreground">
                  الصالح مقابل المختار، يوضح إن كان العدد متوازنًا
                </p>
              </div>
              <ul className="divide-y divide-border">
                {overview.coverage.map((row) => (
                  <li
                    key={row.sectionId}
                    className="flex items-center gap-4 px-5 py-3 text-sm"
                  >
                    <span className="w-40 shrink-0 text-foreground">{row.title}</span>
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">
                      صالح {row.eligible}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="meter block">
                        <span
                          style={{
                            width: `${Math.min(100, row.selected * 20)}%`,
                            background:
                              row.selected === 0 ? "var(--warning)" : undefined,
                          }}
                        />
                      </span>
                    </span>
                    <span className="w-16 shrink-0 text-end tabular-nums text-foreground">
                      {row.selected}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="overflow-hidden">
                <div className="border-b border-border px-5 py-4">
                  <h2 className="text-sm font-semibold text-foreground">
                    خارج الاختيار
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    محفوظة كلها، يمكن إضافتها يدويًا داخل المسودة
                  </p>
                </div>
                {overview.unused.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-muted-foreground">
                    كل المساهمات الصالحة دخلت العدد.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {overview.unused.map((u) => (
                      <li key={u.contributionId} className="px-5 py-3">
                        <p className="truncate text-sm text-foreground">{u.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {u.memberName} · تحريريًا {u.editorialScore} ·{" "}
                          {REASON_LABELS[u.reason] ?? u.reason}, {u.detail}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="overflow-hidden">
                <div className="border-b border-border px-5 py-4">
                  <h2 className="text-sm font-semibold text-foreground">
                    المساهمون
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    النقاط للترتيب فقط، لا تؤثر في اختيار المحتوى
                  </p>
                </div>
                <ul className="divide-y divide-border">
                  {overview.contributors.map((c) => {
                    const points = overview.leaderboard.find(
                      (l) => l.memberName === c.memberName,
                    );
                    return (
                      <li
                        key={c.memberId}
                        className="flex items-center gap-3 px-5 py-3 text-sm"
                      >
                        <span className="min-w-0 flex-1 text-foreground">
                          {c.memberName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {contributionsCount(c.submissions)} · {c.accepted} مقبولة
                        </span>
                        <span className="w-16 text-end text-xs text-muted-foreground">
                          {points ? `${points.points} نقاط` : "0"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </div>
          </>
        )}

        {/* All issues */}
        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-foreground">كل الأعداد</h2>
            <p className="text-xs text-muted-foreground">
              الأعداد المنشورة تبقى كما هي، ولكل عدد مساره الخاص
            </p>
          </div>
          <ul className="divide-y divide-border">
            {(listing?.issues ?? []).map((issue) => (
              <li key={issue.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="w-8 text-sm font-semibold tabular-nums text-foreground">
                  {issue.number}
                </span>
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/admin/newsletter/${issue.id}`}
                    className="text-sm text-foreground hover:underline"
                  >
                    {issue.status === "published" ? "منشور" : "مسودة"} ·{" "}
                    {issue.cycleLabel}
                  </Link>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {issue.items} عنصرًا
                    {issue.openWarnings > 0 && ` · ${issue.openWarnings} ملاحظة مراجعة`}
                    {issue.engine === "source" && " · نص مجمّع من المصدر"}
                    {issue.editedAfterPublish && " · عُدِّل بعد النشر"}
                  </span>
                </span>
                {issue.publication && (
                  <a
                    href={issue.publication.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    الرابط المنشور
                  </a>
                )}
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/newsletter/${issue.id}`}>فتح</Link>
                </Button>
              </li>
            ))}
            {(listing?.legacy ?? []).map((l) => (
              <li key={l.number} className="flex items-center gap-3 px-5 py-3">
                <span className="w-8 text-sm font-semibold tabular-nums text-muted-foreground">
                  {l.number}
                </span>
                <span className="min-w-0 flex-1 text-sm text-muted-foreground">
                  منشور قبل النظام · {l.monthLabel}
                </span>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  الرابط المنشور
                </a>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </AdminGate>
  );
}
