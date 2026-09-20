"use client";

import { Link2, Loader2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  NEWSLETTER_CATEGORIES,
  type Contribution,
  type NewsletterCategory,
} from "@/lib/db/schema";
import type { AutoLabel } from "@/lib/services/title";
import { CATEGORY_LABELS } from "./contribution";
import { useCurrentUser } from "./CurrentUser";

const STEPS = [
  "قراءة المصدر",
  "التحقق منه على الإنترنت",
  "التحقق من تاريخ النشر",
  "المقارنة مع مساهمات سابقة",
  "التصنيف وتحديد الجمهور",
  "تقييم المساهمة",
];

const REASON_MAX = 2000;
/** Five lines, so the field looks like the paragraph it is asking for. */
const REASON_MIN_HEIGHT = 132;

function looksLikeUrl(value: string): boolean {
  const v = value.trim();
  if (!/^https?:\/\//i.test(v)) return false;
  try {
    return new URL(v).hostname.includes(".");
  } catch {
    return false;
  }
}

export default function Composer() {
  const router = useRouter();
  const { member, members, setMemberId, ready, refresh } = useCurrentUser();

  const [url, setUrl] = useState("");
  const [reason, setReason] = useState("");
  const [label, setLabel] = useState<AutoLabel | null>(null);
  const [labeling, setLabeling] = useState(false);
  const [title, setTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [pickingMember, setPickingMember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Only the newest naming request is allowed to write to state.
  const labelRun = useRef(0);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  const runLabel = useCallback(async (link: string, context: string) => {
    const run = ++labelRun.current;
    setLabeling(true);
    try {
      const res = await fetch("/api/title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: link, note: context }),
      });
      const data = (await res.json()) as { label?: AutoLabel };
      if (run !== labelRun.current) return;
      if (data.label) {
        setLabel(data.label);
        setTitle(data.label.title);
      }
    } catch {
      // Silent: the server names it again at submit time if we have nothing.
    } finally {
      if (run === labelRun.current) setLabeling(false);
    }
  }, []);

  // Name the link as soon as it stops changing — no button to press.
  useEffect(() => {
    if (busy) return;
    const link = url.trim();
    if (!looksLikeUrl(link)) {
      labelRun.current++;
      setLabel(null);
      setTitle("");
      setLabeling(false);
      return;
    }
    const timer = setTimeout(() => void runLabel(link, reason), 650);
    return () => clearTimeout(timer);
    // `reason` is deliberately not a dependency: typing should not re-trigger
    // the naming request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, busy, runLabel]);

  // The reason field grows with what is written in it, and never shrinks
  // below the five lines it starts at.
  useEffect(() => {
    const el = reasonRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, REASON_MIN_HEIGHT)}px`;
  }, [reason]);

  async function setFocus(next: NewsletterCategory | null) {
    if (!member) return;
    await fetch(`/api/members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ focusArea: next }),
    });
    await refresh();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    const link = url.trim();
    if (!looksLikeUrl(link)) {
      setError("الصق رابطًا يبدأ بـ https://");
      return;
    }
    if (!member) {
      setPickingMember(true);
      setError("اختر اسمك حتى تُحتسب النقطة في مكانها الصحيح.");
      return;
    }
    if (reason.trim().length < 10) {
      setError("اكتب سببًا محددًا لأهمية هذا المحتوى — جملة قصيرة تكفي.");
      return;
    }

    setError(null);
    setBusy(true);
    setStep(0);
    const ticker = setInterval(
      () => setStep((s) => Math.min(s + 1, STEPS.length - 1)),
      4000,
    );

    try {
      const res = await fetch("/api/contributions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: member.id,
          url: link,
          title: title.trim(),
          memberReason: reason.trim(),
          focusArea: member.focusArea ?? undefined,
        }),
      });
      const data = (await res.json()) as {
        contribution?: Contribution;
        error?: string;
      };
      if (!res.ok || !data.contribution) {
        setError(data.error ?? "حدث خطأ ما. حاول مرة أخرى.");
        return;
      }
      router.push(`/result/${data.contribution.id}`);
      return;
    } catch (err) {
      setError(
        `تعذّر الوصول إلى الخادم (${(err as Error)?.message ?? "خطأ في الشبكة"}).`,
      );
    } finally {
      clearInterval(ticker);
      setBusy(false);
    }
  }

  return (
    <Card className="flex h-full w-full flex-col p-6 sm:p-8">
      <div className="mb-8 text-center">
        <h1 className="font-serif-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          ماذا اكتشفت؟
        </h1>
        <p className="mt-2.5 text-sm text-muted-foreground">
          الصق رابطًا واكتب لماذا يهم — ورصد يتولّى التحقق والتصنيف.
        </p>
      </div>

      <form onSubmit={onSubmit}>
        {/* The one thing this page is for, sized like it. */}
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-2.5 transition-colors duration-200 focus-within:border-ring">
          <Link2
            className="ms-1.5 size-5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
            disabled={busy}
            inputMode="url"
            autoComplete="off"
            aria-label="رابط الشيء الذي اكتشفته"
            placeholder="https://"
            dir="ltr"
            className="h-11 border-0 bg-transparent px-1 text-base focus-visible:border-0"
          />
          <Button
            type="submit"
            size="lg"
            disabled={busy || !url.trim()}
            className="shrink-0"
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            {busy ? "جارٍ التقييم" : "أرسل"}
          </Button>
        </div>

        {(label || labeling) && (
          <div className="fade-in mt-4 px-1">
            {labeling && !label ? (
              <div className="space-y-2">
                <span className="block h-4 w-2/3 rounded bg-muted" />
                <span className="block h-3 w-1/3 rounded bg-muted" />
              </div>
            ) : (
              label && (
                <div>
                  {editingTitle ? (
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      onBlur={() => setEditingTitle(false)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "Escape") {
                          e.preventDefault();
                          setEditingTitle(false);
                        }
                      }}
                      autoFocus
                      maxLength={200}
                      aria-label="العنوان"
                      className="text-sm font-medium"
                    />
                  ) : (
                    <div className="flex items-start gap-2">
                      <p className="text-sm font-medium leading-snug text-foreground">
                        {title || "مساهمة بلا عنوان"}
                      </p>
                      <button
                        type="button"
                        onClick={() => setEditingTitle(true)}
                        disabled={busy}
                        aria-label="تعديل العنوان"
                        title="تعديل العنوان"
                        className="mt-0.5 shrink-0 text-muted-foreground transition-colors duration-200 hover:text-foreground"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{label.domain}</span>
                    <span aria-hidden>·</span>
                    <span>سُمّي تلقائيًا</span>
                    <span aria-hidden>·</span>
                    <span>التصنيف يحدده رصد</span>
                  </div>

                  {label.summary && (
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {label.summary}
                    </p>
                  )}
                </div>
              )
            )}
          </div>
        )}

        {/* The one field the member actually writes. */}
        <div className="mt-5">
          <Textarea
            ref={reasonRef}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            disabled={busy}
            rows={5}
            maxLength={REASON_MAX}
            aria-label="لماذا ترى أن هذا مهم؟"
            placeholder="لماذا ترى أن هذا مهم؟"
            className="resize-none overflow-hidden text-sm leading-relaxed"
            style={{ minHeight: REASON_MIN_HEIGHT }}
          />
          <div className="mt-1.5 flex items-start gap-3 px-1 text-xs text-muted-foreground">
            <p className="min-w-0 flex-1">
              مطلوب — جملة أو جملتان تكفيان. كلامك يُحفظ كما هو.
            </p>
            <span
              className="shrink-0 tabular-nums opacity-70"
              aria-hidden
            >{`${reason.length}/${REASON_MAX}`}</span>
          </div>
        </div>

        {busy && (
          <div className="fade-in mt-5 px-1">
            <p className="text-xs text-muted-foreground">{STEPS[step]}…</p>
            <div className="meter mt-2">
              <span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
            </div>
          </div>
        )}
      </form>

      {error && (
        <p
          className="fade-in mt-4 px-1 text-xs"
          style={{ color: "var(--destructive)" }}
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="mt-8 flex min-h-10 flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
        {!ready ? (
          <span className="h-3 w-28 rounded bg-muted" />
        ) : pickingMember || !member ? (
          <>
            <span className="me-1 text-xs">أنت</span>
            {members.map((m) => (
              <Chip
                key={m.id}
                selected={m.id === member?.id}
                onClick={() => {
                  setMemberId(m.id);
                  setPickingMember(false);
                  setError(null);
                }}
              >
                {m.name}
              </Chip>
            ))}
            {members.length === 0 && (
              <span className="text-xs">
                لا يوجد أعضاء بعد — أضفهم من الإدارة.
              </span>
            )}
          </>
        ) : (
          <Chip onClick={() => setPickingMember(true)}>
            تُرسَل باسم <span className="text-foreground">{member.name}</span>
          </Chip>
        )}
      </div>

      {/* Research direction: a hint to the member, never a filter on the result. */}
      {member && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
          <label htmlFor="focus-area" className="text-xs">
            مجال بحثك
          </label>
          <select
            id="focus-area"
            value={member.focusArea ?? ""}
            onChange={(e) =>
              void setFocus((e.target.value || null) as NewsletterCategory | null)
            }
            className="h-10 cursor-pointer rounded-full border border-border bg-card px-4 text-sm text-foreground transition-colors duration-200 hover:border-border-strong hover:bg-muted focus-visible:border-ring focus-visible:outline-none"
          >
            <option value="">بلا مجال محدد</option>
            {NEWSLETTER_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <span className="w-full text-center opacity-70">
            اتجاه بحث فقط — أرسل أي شيء مفيد تجده خارجه.
          </span>
        </div>
      )}
    </Card>
  );
}
