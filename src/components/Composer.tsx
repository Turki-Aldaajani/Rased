"use client";

import { Check, Link2, Loader2, Pencil } from "lucide-react";
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
import type { Contribution } from "@/lib/db/schema";
import type { AutoLabel } from "@/lib/services/title";
import { cn } from "@/lib/utils";
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
  const { member, members, setMemberId, ready } = useCurrentUser();

  const [url, setUrl] = useState("");
  const [reason, setReason] = useState("");
  const [label, setLabel] = useState<AutoLabel | null>(null);
  const [labeling, setLabeling] = useState(false);
  const [title, setTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleConfirmed, setTitleConfirmed] = useState(false);
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
        setTitleConfirmed(false);
      }
    } catch {
      // Silent: the server names it again at submit time if we have nothing.
    } finally {
      if (run === labelRun.current) setLabeling(false);
    }
  }, []);

  // Name the link as soon as it stops changing, no button to press.
  useEffect(() => {
    if (busy) return;
    const link = url.trim();
    if (!looksLikeUrl(link)) {
      labelRun.current++;
      setLabel(null);
      setTitle("");
      setTitleConfirmed(false);
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

  function confirmTitle() {
    setTitleConfirmed(true);
    reasonRef.current?.focus();
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
      setError("اكتب الخبر بكلماتك، جملة أو جملتان تكفيان.");
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
          الصق رابطًا واكتب الخبر بكلماتك، ورصد يتولّى التحقق والتصنيف.
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
                // The title is the one thing rased writes on behalf of the
                // member, so it is not allowed to slip past them: it sits in
                // its own panel, lit in the identity teal, until they say it
                // is right or fix it themselves.
                <div
                  className={cn(
                    "rounded-lg border p-4 transition-colors duration-200",
                    titleConfirmed ? "border-border" : "border-interactive",
                  )}
                >
                  <p className="text-xs text-muted-foreground">
                    {titleConfirmed
                      ? "العنوان الذي أكّدته"
                      : "اقرأ العنوان قبل الإرسال"}
                  </p>

                  {editingTitle ? (
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      onBlur={() => {
                        setEditingTitle(false);
                        setTitleConfirmed(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "Escape") {
                          e.preventDefault();
                          setEditingTitle(false);
                          setTitleConfirmed(true);
                        }
                      }}
                      autoFocus
                      maxLength={200}
                      aria-label="العنوان"
                      className="mt-2 text-base font-medium"
                    />
                  ) : (
                    <p className="mt-1.5 text-base font-medium leading-snug text-foreground">
                      {title || "مساهمة بلا عنوان"}
                    </p>
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

                  {!editingTitle && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {titleConfirmed ? (
                        <span
                          className="inline-flex items-center gap-1.5 text-xs"
                          style={{ color: "var(--interactive-bright)" }}
                        >
                          <Check className="size-3.5" aria-hidden />
                          العنوان مؤكَّد
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy}
                          onClick={confirmTitle}
                        >
                          <Check aria-hidden />
                          العنوان صحيح
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setEditingTitle(true)}
                      >
                        <Pencil aria-hidden />
                        عدّل العنوان
                      </Button>
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        )}

        {/* The one field the member actually writes, and the one the
            newsletter prints word for word. */}
        <div className="mt-5">
          <label
            htmlFor="member-text"
            className="block text-sm font-medium text-foreground"
          >
            اكتب الخبر هنا
          </label>
          <p className="mt-1 mb-2 text-xs leading-relaxed text-muted-foreground">
            لخّص الخبر بكلماتك، وأضف لماذا يهم فريقنا. هذا النص يظهر في النشرة
            كما كتبته.
          </p>
          <Textarea
            id="member-text"
            ref={reasonRef}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            disabled={busy}
            rows={5}
            maxLength={REASON_MAX}
            placeholder="مثال: أطلقت Anthropic نموذج Claude جديدًا يدعم..."
            className="resize-none overflow-hidden text-sm leading-relaxed"
            style={{ minHeight: REASON_MIN_HEIGHT }}
          />
          <div className="mt-1.5 flex items-start gap-3 px-1 text-xs text-muted-foreground">
            <p className="min-w-0 flex-1">
              مطلوب، جملة أو جملتان تكفيان. كلامك يُحفظ كما هو.
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
                لا يوجد أعضاء بعد، أضفهم من الإدارة.
              </span>
            )}
          </>
        ) : (
          <Chip onClick={() => setPickingMember(true)}>
            تُرسَل باسم <span className="text-foreground">{member.name}</span>
          </Chip>
        )}
      </div>

      {/* The section is not the member's to choose: rased reads the link and
          the text and decides, and a host confirms it. Picking your own
          section was the one way to aim at the bonus you wanted. */}
      <p className="mt-4 text-center text-xs text-muted-foreground">
        القسم يحدده رصد من محتوى الرابط ونصّك، ويؤكده المضيف.
      </p>
    </Card>
  );
}
