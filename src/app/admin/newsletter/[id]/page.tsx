"use client";

import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Eye,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import AdminGate from "@/components/admin/AdminGate";
import { useAdminSession } from "@/components/admin/useAdminSession";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SECTIONS, type SectionId, type SectionKind } from "@/lib/newsletter/sections";
import type { NewsletterIssue, NewsletterItem } from "@/lib/newsletter/types";
import { cn } from "@/lib/utils";

interface Candidate {
  contributionId: string;
  title: string;
  memberName: string;
  category: string | null;
  editorialScore: number;
  status: string;
}

interface IssueContext {
  issue: NewsletterIssue;
  candidates: Candidate[];
  openWarnings: number;
  url: string;
  regenerateError?: string | null;
  publishWarnings?: string[];
}

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground transition-colors duration-200 focus-visible:border-ring focus-visible:outline-none";

const kindOf = (id: SectionId): SectionKind =>
  SECTIONS.find((s) => s.id === id)!.kind;

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function NewsletterEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { ready, authed, signIn, send } = useAdminSession();

  const [data, setData] = useState<IssueContext | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [addTo, setAddTo] = useState<SectionId>("top_news");

  const load = useCallback(async () => {
    const res = await send(`/api/newsletters/${id}`);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setMessage(body.error ?? "تعذّر تحميل العدد.");
      return;
    }
    setData((await res.json()) as IssueContext);
    setDirty(false);
  }, [send, id]);

  useEffect(() => {
    if (authed) void load();
  }, [authed, load]);

  const issue = data?.issue;
  const published = issue?.status === "published";

  /** Local edit of the draft; nothing leaves the browser until "حفظ". */
  function patchIssue(fn: (draft: NewsletterIssue) => NewsletterIssue) {
    setData((d) => (d ? { ...d, issue: fn(d.issue) } : d));
    setDirty(true);
  }

  function patchItem(sectionId: SectionId, itemId: string, patch: Partial<NewsletterItem>) {
    patchIssue((draft) => ({
      ...draft,
      sections: draft.sections.map((s) =>
        s.id !== sectionId
          ? s
          : { ...s, items: s.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) },
      ),
    }));
  }

  function moveItem(sectionId: SectionId, index: number, delta: number) {
    patchIssue((draft) => ({
      ...draft,
      sections: draft.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const items = [...s.items];
        const target = index + delta;
        if (target < 0 || target >= items.length) return s;
        [items[index], items[target]] = [items[target], items[index]];
        return { ...s, items };
      }),
    }));
  }

  function moveToSection(from: SectionId, itemId: string, to: SectionId) {
    if (from === to) return;
    patchIssue((draft) => {
      const item = draft.sections
        .find((s) => s.id === from)!
        .items.find((i) => i.id === itemId)!;
      return {
        ...draft,
        sections: draft.sections.map((s) => {
          if (s.id === from) return { ...s, items: s.items.filter((i) => i.id !== itemId) };
          if (s.id === to) return { ...s, items: [...s.items, item] };
          return s;
        }),
      };
    });
  }

  function removeItem(sectionId: SectionId, itemId: string) {
    patchIssue((draft) => ({
      ...draft,
      sections: draft.sections.map((s) =>
        s.id === sectionId ? { ...s, items: s.items.filter((i) => i.id !== itemId) } : s,
      ),
    }));
  }

  async function post(url: string, body: unknown, key: string) {
    setBusy(key);
    setMessage(null);
    setNotice(null);
    try {
      const res = await send(url, { method: "POST", body: JSON.stringify(body) });
      const payload = (await res.json().catch(() => ({}))) as IssueContext & {
        error?: string;
      };
      if (!res.ok) {
        setMessage(payload.error ?? "لم تنجح العملية.");
        return null;
      }
      setData(payload);
      setDirty(false);
      if (payload.regenerateError) setMessage(payload.regenerateError);
      if (payload.publishWarnings?.length) setMessage(payload.publishWarnings.join(" · "));
      return payload;
    } finally {
      setBusy(null);
    }
  }

  async function save(extra: Record<string, unknown> = {}) {
    if (!issue) return false;
    setBusy("save");
    setMessage(null);
    try {
      const res = await send(`/api/newsletters/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: issue.title,
          lead: issue.lead,
          closing: issue.closing,
          sections: issue.sections.map((s) => ({ id: s.id, items: s.items })),
          ...extra,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as IssueContext & {
        error?: string;
        needsConfirmation?: boolean;
      };
      if (!res.ok) {
        setMessage(payload.error ?? "تعذّر الحفظ.");
        return false;
      }
      setData(payload);
      setDirty(false);
      setNotice("حُفظت المسودة.");
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function showPreview() {
    setBusy("preview");
    try {
      const res = await send(`/api/newsletters/${id}/preview`, {
        headers: { Accept: "text/html" },
      });
      setPreview(res.ok ? await res.text() : null);
      if (!res.ok) setMessage("تعذّرت المعاينة.");
    } finally {
      setBusy(null);
    }
  }

  async function openPreviewTab() {
    const res = await send(`/api/newsletters/${id}/preview`, {
      headers: { Accept: "text/html" },
    });
    if (!res.ok) return setMessage("تعذّرت المعاينة.");
    const url = URL.createObjectURL(new Blob([await res.text()], { type: "text/html" }));
    window.open(url, "_blank", "noopener");
  }

  async function publish() {
    const warnings = data?.openWarnings ?? 0;
    if (warnings > 0) {
      const ok = window.confirm(
        `في المسودة ${warnings} ملاحظة مراجعة مفتوحة. هل اطّلعت عليها وتريد النشر؟`,
      );
      if (!ok) return;
    }
    if (published) {
      const ok = window.confirm(
        "هذا العدد منشور. إعادة النشر ستستبدل الصفحة المنشورة. متابعة؟",
      );
      if (!ok) return;
    }
    const result = await post(
      `/api/newsletters/${id}/publish`,
      { acknowledgeWarnings: warnings > 0, republish: published },
      "publish",
    );
    if (result?.issue.publication) setNotice(`نُشر على ${result.issue.publication.url}`);
  }

  async function removeDraft() {
    if (!window.confirm("حذف هذه المسودة نهائيًا؟")) return;
    setBusy("delete");
    const res = await send(`/api/newsletters/${id}`, { method: "DELETE" });
    setBusy(null);
    if (res.ok) window.location.href = "/admin/newsletter";
    else setMessage("تعذّر الحذف.");
  }

  return (
    <AdminGate ready={ready} authed={authed} onSignIn={signIn}>
      {!issue ? (
        <Card className="p-5 text-sm text-muted-foreground">
          {message ?? "جارٍ التحميل…"}
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="ghost" size="sm" className="-ms-3">
              <Link href="/admin/newsletter">
                <ArrowRight />
                النشرة
              </Link>
            </Button>
            <div className="ms-auto flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={showPreview}
                disabled={busy !== null}
              >
                {busy === "preview" ? <Loader2 className="animate-spin" /> : <Eye />}
                معاينة
              </Button>
              <Button variant="outline" size="sm" onClick={openPreviewTab}>
                فتح في تبويب
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => post(`/api/newsletters/${id}/regenerate`, { scope: "issue" }, "regen")}
                disabled={busy !== null || published}
              >
                {busy === "regen" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                إعادة توليد كامل
              </Button>
              <Button
                size="sm"
                onClick={() => save(published ? { confirmPublishedEdit: true } : {})}
                disabled={busy !== null || !dirty}
              >
                {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />}
                حفظ
              </Button>
              <Button size="sm" onClick={publish} disabled={busy !== null}>
                {busy === "publish" ? <Loader2 className="animate-spin" /> : <Upload />}
                {published ? "إعادة النشر" : "نشر"}
              </Button>
            </div>
          </div>

          <Card className="p-5">
            <div className="flex flex-wrap items-baseline gap-3">
              <h1 className="font-serif-display text-xl font-semibold text-foreground">
                العدد {issue.number}
              </h1>
              <span className="text-sm text-muted-foreground">
                {published ? "منشور" : "مسودة"} ·{" "}
                {issue.cycleStart} إلى {issue.cycleEnd}
              </span>
              {data && data.openWarnings > 0 && (
                <span
                  className="text-xs"
                  style={{ color: "var(--warning)" }}
                >
                  {data.openWarnings} ملاحظة مراجعة
                </span>
              )}
              {issue.generation.engine === "source" && (
                <span className="text-xs text-muted-foreground">
                  النص مجمّع من بيانات المساهمات دون صياغة آلية
                </span>
              )}
              {dirty && (
                <span className="text-xs" style={{ color: "var(--warning)" }}>
                  تعديلات غير محفوظة
                </span>
              )}
            </div>

            {issue.publication && (
              <p className="mt-2 text-xs text-muted-foreground">
                منشور على{" "}
                <a
                  href={issue.publication.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  {issue.publication.url}
                </a>{" "}
                ({issue.publication.target}، نسخة {issue.publication.version})
              </p>
            )}
            {issue.generation.errors.length > 0 && (
              <ul className="mt-3 space-y-1">
                {issue.generation.errors.map((e, i) => (
                  <li key={i} className="text-xs" style={{ color: "var(--destructive)" }}>
                    {e}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Field label="عنوان النشرة">
                <Input
                  value={issue.title}
                  onChange={(e) => patchIssue((d) => ({ ...d, title: e.target.value }))}
                />
              </Field>
              <Field label="الافتتاحية" hint="تظهر أسفل عنوان الغلاف">
                <Textarea
                  className="min-h-16 text-sm"
                  value={issue.lead}
                  onChange={(e) => patchIssue((d) => ({ ...d, lead: e.target.value }))}
                />
              </Field>
              <Field label="إنجاز يقول لك" hint="سطران في خاتمة العدد">
                <Textarea
                  className="min-h-16 text-sm"
                  value={issue.closing}
                  onChange={(e) => patchIssue((d) => ({ ...d, closing: e.target.value }))}
                />
              </Field>
            </div>
          </Card>

          {message && (
            <p className="text-sm" style={{ color: "var(--destructive)" }}>
              {message}
            </p>
          )}
          {notice && (
            <p className="text-sm" style={{ color: "var(--success)" }}>
              {notice}
            </p>
          )}

          {preview && (
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <h2 className="text-sm font-semibold text-foreground">المعاينة</h2>
                <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
                  إغلاق
                </Button>
              </div>
              <iframe
                title="معاينة العدد"
                srcDoc={preview}
                className="h-[70vh] w-full border-0 bg-white"
              />
            </Card>
          )}

          {/* Sections */}
          {issue.sections.map((section) => (
            <Card key={section.id} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
                <h2 className="text-sm font-semibold text-foreground">
                  {section.title}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {section.items.length} عنصرًا
                </span>
                {section.error && (
                  <span className="text-xs" style={{ color: "var(--destructive)" }}>
                    {section.error}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="ms-auto"
                  disabled={busy !== null || published || section.items.length === 0}
                  onClick={() =>
                    post(
                      `/api/newsletters/${id}/regenerate`,
                      { scope: "section", sectionId: section.id },
                      `sec-${section.id}`,
                    )
                  }
                >
                  {busy === `sec-${section.id}` ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <RefreshCw />
                  )}
                  إعادة توليد القسم
                </Button>
              </div>

              {section.items.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-foreground">
                  لا يوجد محتوى مختار لهذا القسم — سيُحذف القسم من الصفحة المنشورة.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {section.items.map((item, index) => {
                    const expanded = open[item.id] ?? false;
                    const kind = kindOf(section.id);
                    const warnings = item.flags.filter((f) => f.severity === "warning");
                    return (
                      <li key={item.id}>
                        <div className="flex flex-wrap items-center gap-2 px-5 py-3">
                          <span className="w-6 text-xs tabular-nums text-muted-foreground">
                            {index + 1}
                          </span>
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-start"
                            onClick={() =>
                              setOpen((o) => ({ ...o, [item.id]: !expanded }))
                            }
                          >
                            <span className="block truncate text-sm text-foreground">
                              {item.title || "بلا عنوان"}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {item.contributor.memberName} · تحريريًا{" "}
                              {item.editorialScore}
                              {warnings.length > 0 && ` · ${warnings.length} ملاحظة`}
                              {item.writtenBy === "editor" && " · تحرير يدوي"}
                            </span>
                          </button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => moveItem(section.id, index, -1)}
                            disabled={index === 0}
                            aria-label="أعلى"
                          >
                            <ChevronUp />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => moveItem(section.id, index, 1)}
                            disabled={index === section.items.length - 1}
                            aria-label="أسفل"
                          >
                            <ChevronDown />
                          </Button>
                          <select
                            className={SELECT_CLASS}
                            value={section.id}
                            aria-label="نقل إلى قسم"
                            onChange={(e) =>
                              moveToSection(section.id, item.id, e.target.value as SectionId)
                            }
                          >
                            {SECTIONS.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.title}
                              </option>
                            ))}
                          </select>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy !== null || published}
                            onClick={() =>
                              post(
                                `/api/newsletters/${id}/regenerate`,
                                { scope: "item", itemId: item.id },
                                `item-${item.id}`,
                              )
                            }
                          >
                            {busy === `item-${item.id}` ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <RefreshCw />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeItem(section.id, item.id)}
                            style={{ color: "var(--destructive)" }}
                            aria-label="إزالة"
                          >
                            <Trash2 />
                          </Button>
                        </div>

                        {expanded && (
                          <div className="space-y-3 border-t border-border bg-muted px-5 py-4">
                            {item.flags.length > 0 && (
                              <ul className="space-y-1">
                                {item.flags.map((f, i) => (
                                  <li
                                    key={i}
                                    className="flex items-start gap-2 text-xs"
                                    style={{
                                      color:
                                        f.severity === "warning"
                                          ? "var(--warning)"
                                          : "var(--muted-foreground)",
                                    }}
                                  >
                                    <span
                                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                                      style={{ background: "currentColor" }}
                                      aria-hidden
                                    />
                                    {f.message}
                                  </li>
                                ))}
                              </ul>
                            )}

                            <Field label="العنوان">
                              <Input
                                value={item.title}
                                onChange={(e) =>
                                  patchItem(section.id, item.id, { title: e.target.value })
                                }
                              />
                            </Field>

                            {section.id === "top_news" && (
                              <Field
                                label="سطر الملخص"
                                hint="يظهر في قائمة أهم الأخبار المرقّمة"
                              >
                                <Input
                                  value={item.headline}
                                  onChange={(e) =>
                                    patchItem(section.id, item.id, {
                                      headline: e.target.value,
                                    })
                                  }
                                />
                              </Field>
                            )}

                            <Field label="النص" hint="افصل الفقرات بسطر فارغ">
                              <Textarea
                                className="min-h-32 text-sm"
                                value={item.paragraphs.join("\n\n")}
                                onChange={(e) =>
                                  patchItem(section.id, item.id, {
                                    paragraphs: e.target.value
                                      .split(/\n{2,}/)
                                      .map((p) => p.trim())
                                      .filter(Boolean),
                                  })
                                }
                              />
                            </Field>

                            <Field
                              label="لماذا يهمك؟"
                              hint={`سبب العضو كما كتبه: «${item.whyItMatters ? "" : "لم يُحفظ"}»`}
                            >
                              <Textarea
                                className="min-h-20 text-sm"
                                value={item.whyItMatters}
                                onChange={(e) =>
                                  patchItem(section.id, item.id, {
                                    whyItMatters: e.target.value,
                                  })
                                }
                              />
                            </Field>

                            {kind === "tool" && (
                              <div className="grid gap-3 sm:grid-cols-2">
                                <Field label="وسم الجمهور" hint="مثل: للمطورين">
                                  <Input
                                    value={item.chip}
                                    onChange={(e) =>
                                      patchItem(section.id, item.id, { chip: e.target.value })
                                    }
                                  />
                                </Field>
                                <Field label="مناسب لـ">
                                  <Input
                                    value={item.fitText}
                                    onChange={(e) =>
                                      patchItem(section.id, item.id, {
                                        fitText: e.target.value,
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="الفكرة">
                                  <Textarea
                                    className="min-h-16 text-sm"
                                    value={item.idea}
                                    onChange={(e) =>
                                      patchItem(section.id, item.id, { idea: e.target.value })
                                    }
                                  />
                                </Field>
                                <Field label="مثال عملي">
                                  <Textarea
                                    className="min-h-16 text-sm"
                                    value={item.example}
                                    onChange={(e) =>
                                      patchItem(section.id, item.id, {
                                        example: e.target.value,
                                      })
                                    }
                                  />
                                </Field>
                              </div>
                            )}

                            {kind === "learn" && (
                              <div className="grid gap-3 sm:grid-cols-2">
                                <Field label="المستوى" hint="مبتدئ / متوسط / متقدم">
                                  <Input
                                    value={item.levelLabel}
                                    onChange={(e) =>
                                      patchItem(section.id, item.id, {
                                        levelLabel: e.target.value,
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="الكاتب أو الجهة">
                                  <Input
                                    value={item.byline}
                                    onChange={(e) =>
                                      patchItem(section.id, item.id, {
                                        byline: e.target.value,
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="مناسب لمن">
                                  <Input
                                    value={item.fitText}
                                    onChange={(e) =>
                                      patchItem(section.id, item.id, {
                                        fitText: e.target.value,
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="المتطلبات" hint="افصل بينها بفاصلة">
                                  <Input
                                    value={item.prerequisites.join("، ")}
                                    onChange={(e) =>
                                      patchItem(section.id, item.id, {
                                        prerequisites: e.target.value
                                          .split(/[،,]/)
                                          .map((p) => p.trim())
                                          .filter(Boolean),
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="مثال سريع">
                                  <Textarea
                                    className="min-h-16 text-sm"
                                    value={item.example}
                                    onChange={(e) =>
                                      patchItem(section.id, item.id, {
                                        example: e.target.value,
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="ملاحظة ختامية">
                                  <Textarea
                                    className="min-h-16 text-sm"
                                    value={item.note}
                                    onChange={(e) =>
                                      patchItem(section.id, item.id, { note: e.target.value })
                                    }
                                  />
                                </Field>
                              </div>
                            )}

                            {kind === "social" && (
                              <div className="grid gap-3 sm:grid-cols-2">
                                <Field label="المنصة">
                                  <Input
                                    value={item.platform}
                                    onChange={(e) =>
                                      patchItem(section.id, item.id, {
                                        platform: e.target.value,
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="المغزى">
                                  <Textarea
                                    className="min-h-16 text-sm"
                                    value={item.moral}
                                    onChange={(e) =>
                                      patchItem(section.id, item.id, { moral: e.target.value })
                                    }
                                  />
                                </Field>
                              </div>
                            )}

                            <div className="grid gap-3 sm:grid-cols-3">
                              <Field label="اسم المصدر">
                                <Input
                                  value={item.source.name}
                                  onChange={(e) =>
                                    patchItem(section.id, item.id, {
                                      source: { ...item.source, name: e.target.value },
                                    })
                                  }
                                />
                              </Field>
                              <Field label="الرابط">
                                <Input
                                  dir="ltr"
                                  value={item.source.url}
                                  onChange={(e) =>
                                    patchItem(section.id, item.id, {
                                      source: { ...item.source, url: e.target.value },
                                    })
                                  }
                                />
                              </Field>
                              {(kind === "tool" || kind === "learn") && (
                                <Field label="نص الزر">
                                  <Input
                                    value={item.ctaLabel}
                                    onChange={(e) =>
                                      patchItem(section.id, item.id, {
                                        ctaLabel: e.target.value,
                                      })
                                    }
                                  />
                                </Field>
                              )}
                            </div>

                            <p className="text-xs text-muted-foreground">
                              مساهمة{" "}
                              <Link
                                href={`/result/${item.contributionId}`}
                                className="text-foreground underline-offset-4 hover:underline"
                              >
                                {item.contributor.memberName}
                              </Link>
                              {item.source.publishedAt
                                ? ` · نُشر ${item.source.publishedAt}`
                                : " · تاريخ النشر غير معروف"}
                            </p>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          ))}

          {/* Add from the cycle */}
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold text-foreground">
                إضافة من مساهمات الدورة
              </h2>
              <select
                className={cn(SELECT_CLASS, "ms-auto")}
                value={addTo}
                aria-label="القسم"
                onChange={(e) => setAddTo(e.target.value as SectionId)}
              >
                {SECTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>
            {(data?.candidates.length ?? 0) === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                كل مساهمات الدورة داخل العدد.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {data!.candidates.map((c) => (
                  <li
                    key={c.contributionId}
                    className="flex flex-wrap items-center gap-3 px-5 py-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">
                        {c.title}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {c.memberName} · تحريريًا {c.editorialScore} · {c.status}
                      </span>
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy !== null || published}
                      onClick={() =>
                        post(
                          `/api/newsletters/${id}/items`,
                          { contributionId: c.contributionId, sectionId: addTo },
                          `add-${c.contributionId}`,
                        )
                      }
                    >
                      {busy === `add-${c.contributionId}` ? (
                        <Loader2 className="animate-spin" />
                      ) : null}
                      أضف
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {!published && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={removeDraft}
                disabled={busy !== null}
                style={{ color: "var(--destructive)" }}
              >
                <Trash2 />
                حذف المسودة
              </Button>
            </div>
          )}
        </div>
      )}
    </AdminGate>
  );
}
