"use client";

import { Link2, Loader2, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CONTRIBUTION_TYPES, type Contribution } from "@/lib/db/schema";
import type { AutoLabel } from "@/lib/services/title";
import { cn } from "@/lib/utils";
import { typeLabel } from "./contribution";
import { useCurrentUser } from "./CurrentUser";

const STEPS = [
  "قراءة المصدر",
  "التحقق منه على الإنترنت",
  "التحقق من تاريخ النشر",
  "المقارنة مع اكتشافات سابقة",
  "تقييم المساهمة",
];

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
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [label, setLabel] = useState<AutoLabel | null>(null);
  const [labeling, setLabeling] = useState(false);
  const [title, setTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [type, setType] = useState<string>("");
  const [pickingMember, setPickingMember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Only the newest naming request is allowed to write to state.
  const labelRun = useRef(0);
  const noteRef = useRef<HTMLTextAreaElement>(null);

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
        setType(data.label.type);
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
      setType("");
      setLabeling(false);
      return;
    }
    const timer = setTimeout(() => void runLabel(link, note), 650);
    return () => clearTimeout(timer);
    // `note` is deliberately not a dependency: typing a take should not
    // re-trigger the naming request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, busy, runLabel]);

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
      setError("اختر اسمك حتى تُحتسب النقاط في مكانها الصحيح.");
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
          type,
          description: label?.summary ?? "",
          whyUseful: note.trim(),
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
    <section className="mx-auto w-full max-w-xl">
      <div className="mb-10 text-center">
        <h1 className="font-serif-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          ماذا اكتشفت؟
        </h1>
        <p className="mt-2.5 text-sm text-muted-foreground">
          الصق رابطًا، يُقرأ ويُتحقق منه ويُقيّم تلقائيًا — بدون نماذج معقدة.
        </p>
      </div>

      <form onSubmit={onSubmit}>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-2 transition-colors duration-200 focus-within:border-ring">
          <Link2
            className="ms-1.5 size-4 shrink-0 text-muted-foreground"
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
            className="h-9 border-0 bg-transparent px-1 text-base focus-visible:border-0 sm:text-sm"
          />
          <Button
            type="submit"
            disabled={busy || !url.trim()}
            className="shrink-0"
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            {busy ? "جارٍ التقييم" : "قيّم"}
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
                        {title || "اكتشاف بلا عنوان"}
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
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                      disabled={busy}
                      aria-label="نوع المساهمة"
                      className="cursor-pointer rounded border-0 bg-transparent p-0 text-xs text-muted-foreground underline decoration-dotted underline-offset-4 outline-none transition-colors duration-200 hover:text-foreground"
                    >
                      {CONTRIBUTION_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {typeLabel(t)}
                        </option>
                      ))}
                    </select>
                    <span aria-hidden>·</span>
                    <span>{label.domain}</span>
                    <span aria-hidden>·</span>
                    <span>سُمّي تلقائيًا</span>
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

        {noteOpen ? (
          <div className="fade-in mt-4">
            <Textarea
              ref={noteRef}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={busy}
              maxLength={2000}
              placeholder="لماذا هذا مفيد؟ وفيم قد تستخدمه؟"
              className="text-sm"
            />
            <p className="mt-1.5 px-1 text-xs text-muted-foreground">
              اختياري — من هنا تأتي نقاطك الشخصية.
            </p>
          </div>
        ) : (
          !busy && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setNoteOpen(true);
                setTimeout(() => noteRef.current?.focus(), 40);
              }}
              className="mt-3"
            >
              <Plus />
              أضف رأيك
            </Button>
          )
        )}

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

      <div className="mt-8 flex min-h-8 items-center justify-center text-xs text-muted-foreground">
        {!ready ? (
          <span className="h-3 w-28 rounded bg-muted" />
        ) : pickingMember || !member ? (
          <div className="flex flex-wrap items-center justify-center gap-1">
            <span className="me-1">أنت</span>
            {members.map((m) => (
              <Button
                key={m.id}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMemberId(m.id);
                  setPickingMember(false);
                  setError(null);
                }}
                className={cn(
                  m.id === member?.id && "text-foreground",
                )}
              >
                {m.name}
              </Button>
            ))}
            {members.length === 0 && (
              <span>لا يوجد أعضاء بعد — أضفهم من الإدارة.</span>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPickingMember(true)}
            className="transition-colors duration-200 hover:text-foreground"
          >
            تُرسَل باسم <span className="text-foreground">{member.name}</span>
          </button>
        )}
      </div>
    </section>
  );
}
