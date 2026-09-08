"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { CONTRIBUTION_TYPES, type Contribution } from "@/lib/db/schema";
import type { AutoLabel } from "@/lib/services/title";
import { useCurrentUser } from "./CurrentUser";

const STEPS = [
  "Reading your source",
  "Searching the web to verify it",
  "Checking the publication date",
  "Comparing with earlier finds",
  "Scoring the contribution",
];

/** Each type gets its own gradient tile, so the card reads at a glance. */
const TYPE_LOOK: Record<string, { icon: string; grad: string }> = {
  "AI News": { icon: "📰", grad: "var(--grad-brand)" },
  "AI Tool": { icon: "🛠️", grad: "var(--grad-blue)" },
  "Research / Paper": { icon: "📄", grad: "var(--grad-violet)" },
  Project: { icon: "🧪", grad: "var(--grad-mint)" },
  "AI Use Case": { icon: "💡", grad: "var(--grad-amber)" },
  "Learning Resource": { icon: "📚", grad: "var(--grad-pink)" },
  Other: { icon: "✨", grad: "var(--grad-brand)" },
};

function looksLikeUrl(value: string): boolean {
  const v = value.trim();
  if (!/^https?:\/\//i.test(v)) return false;
  try {
    return Boolean(new URL(v).hostname.includes("."));
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
  const [focused, setFocused] = useState(false);
  const [pickingMember, setPickingMember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Only the newest label request is allowed to write to state.
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
      const data = (await res.json()) as { label?: AutoLabel; error?: string };
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
      setError("Paste a link that starts with https://");
      return;
    }
    if (!member) {
      setPickingMember(true);
      setError("Pick your name so the points land in the right place.");
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
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      router.push(`/result/${data.contribution.id}`);
      return;
    } catch (err) {
      setError(
        `Could not reach the server (${(err as Error)?.message ?? "network error"}).`,
      );
    } finally {
      clearInterval(ticker);
      setBusy(false);
    }
  }

  const look = TYPE_LOOK[type] ?? TYPE_LOOK.Other;
  const showCard = Boolean(label) || labeling;

  return (
    <section className="mx-auto w-full max-w-2xl">
      <div className="mb-8 flex flex-col items-center text-center">
        <span className="icon-tile mb-5 h-14 w-14 text-2xl" aria-hidden>
          🎯
        </span>
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          What did you find <span className="grad-text">today</span>?
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
          Paste one link. We read it, verify it on the web, check who found it
          first, and score it out of 100.
        </p>
      </div>

      <form onSubmit={onSubmit}>
        <div className="composer-ring" data-focused={focused || busy}>
          <div className="card rounded-3xl p-2.5">
            <div className="flex items-center gap-2">
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-lg transition-colors"
                style={{
                  background: "var(--brand-soft)",
                  color: "var(--brand-ink)",
                }}
                aria-hidden
              >
                🔗
              </span>
              <input
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError(null);
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                disabled={busy}
                inputMode="url"
                autoComplete="off"
                aria-label="Link to the thing you found"
                placeholder="Paste a link — an announcement, repo, paper…"
                className="min-w-0 flex-1 bg-transparent px-1 text-base text-ink outline-none placeholder:text-muted"
              />
              <button
                type="submit"
                disabled={busy || !url.trim()}
                className="btn-primary h-11 w-11 shrink-0 rounded-2xl p-0 text-lg"
                aria-label="Evaluate this find"
                title="Evaluate this find"
              >
                {busy ? (
                  <span className="block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : (
                  <span aria-hidden>↑</span>
                )}
              </button>
            </div>

            {showCard && (
              <div className="rise mt-2.5 rounded-2xl border border-line bg-[var(--sand-soft)] p-3">
                {labeling && !label ? (
                  <div className="flex items-center gap-3">
                    <span className="h-10 w-10 shrink-0 rounded-xl shimmer" />
                    <span className="min-w-0 flex-1 space-y-2">
                      <span className="block h-3.5 w-3/4 rounded-full shimmer" />
                      <span className="block h-3 w-2/5 rounded-full shimmer" />
                    </span>
                  </div>
                ) : (
                  label && (
                    <div className="flex items-start gap-3">
                      <span
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-base text-[var(--on-brand)]"
                        style={{ background: look.grad }}
                        aria-hidden
                      >
                        {look.icon}
                      </span>

                      <div className="min-w-0 flex-1">
                        {editingTitle ? (
                          <input
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
                            aria-label="Title"
                            className="field py-1.5 text-sm font-semibold"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditingTitle(true)}
                            disabled={busy}
                            title="Click to edit the title"
                            className="group flex w-full items-start gap-1.5 text-left"
                          >
                            <span className="text-sm font-semibold leading-snug text-ink">
                              {title || "Untitled find"}
                            </span>
                            <span
                              className="mt-0.5 shrink-0 text-xs text-muted opacity-0 transition-opacity group-hover:opacity-100"
                              aria-hidden
                            >
                              ✎
                            </span>
                          </button>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <div className="relative">
                            <select
                              value={type}
                              onChange={(e) => setType(e.target.value)}
                              disabled={busy}
                              aria-label="Contribution type"
                              className="cursor-pointer appearance-none rounded-full bg-brand-soft py-1 pl-2.5 pr-6 text-xs font-semibold text-brand-ink outline-none"
                            >
                              {CONTRIBUTION_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                            <span
                              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-brand-ink"
                              aria-hidden
                            >
                              ▾
                            </span>
                          </div>
                          <span className="text-xs text-muted">
                            {label.domain}
                          </span>
                          <span className="text-xs text-muted">
                            ·{" "}
                            {label.engine === "ai"
                              ? "named by AI"
                              : "named from the page"}
                          </span>
                        </div>

                        {label.summary && (
                          <p className="mt-2 text-xs leading-relaxed text-muted">
                            {label.summary}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}

            {noteOpen ? (
              <div className="rise mt-2.5">
                <textarea
                  ref={noteRef}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={busy}
                  maxLength={2000}
                  placeholder="Why is this useful? Your own take — what would you use it for?"
                  className="field min-h-20 resize-y rounded-2xl border-transparent bg-[var(--sand-soft)] text-sm"
                />
                <p className="hint px-1">
                  Optional, but this is where your personal points come from.
                  Something you tested beats something you skimmed.
                </p>
              </div>
            ) : (
              !busy && (
                <button
                  type="button"
                  onClick={() => {
                    setNoteOpen(true);
                    setTimeout(() => noteRef.current?.focus(), 40);
                  }}
                  className="btn-ghost btn-sm mt-1.5 w-full justify-start rounded-2xl"
                >
                  <span aria-hidden>＋</span> Add your take
                  <span className="text-[11px] opacity-70">
                    (worth up to 10 points)
                  </span>
                </button>
              )
            )}

            {busy && (
              <div className="rise mt-2.5 rounded-2xl border border-line bg-brand-soft p-4">
                <p className="text-sm font-semibold text-brand-ink">
                  {STEPS[step]}…
                </p>
                <p className="mt-1 text-xs text-muted">
                  Verification can take up to a minute. Keep this tab open.
                </p>
                <div className="meter mt-3">
                  <span
                    style={{
                      width: `${((step + 1) / STEPS.length) * 100}%`,
                      transition: "width 600ms ease",
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </form>

      {error && (
        <p
          className="rise mx-auto mt-3 w-fit rounded-xl px-3 py-2 text-sm"
          style={{
            color: "var(--error)",
            background: "color-mix(in srgb, var(--error) 10%, transparent)",
          }}
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="mt-4 flex min-h-9 items-center justify-center text-xs text-muted">
        {!ready ? (
          <span className="h-4 w-32 rounded-full shimmer" />
        ) : pickingMember || !member ? (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <span className="mr-1">You are</span>
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMemberId(m.id);
                  setPickingMember(false);
                  setError(null);
                }}
                className={`btn-secondary btn-sm rounded-full ${
                  m.id === member?.id ? "border-brand text-brand-ink" : ""
                }`}
              >
                {m.name}
              </button>
            ))}
            {members.length === 0 && (
              <span>No team members yet — add them in Admin.</span>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPickingMember(true)}
            className="btn-ghost btn-sm rounded-full"
          >
            Submitting as
            <span className="font-semibold text-ink">{member.name}</span>
            <span className="opacity-60">· switch</span>
          </button>
        )}
      </div>
    </section>
  );
}
