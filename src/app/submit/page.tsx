"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useCurrentUser } from "@/components/CurrentUser";
import { CONTRIBUTION_TYPES, type Contribution } from "@/lib/db/schema";

const STEPS = [
  "Reading your source",
  "Searching the web to verify it",
  "Checking the publication date",
  "Comparing with earlier finds",
  "Scoring the contribution",
];

export default function SubmitPage() {
  const router = useRouter();
  const { member, members, setMemberId, ready } = useCurrentUser();

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [whyUseful, setWhyUseful] = useState("");
  const [type, setType] = useState<string>("AI News");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!member) {
      setError("Pick your name at the top first.");
      return;
    }
    setError(null);
    setBusy(true);
    setStep(0);

    // The evaluation is one request; this just keeps the user company.
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
          title,
          url,
          description,
          whyUseful,
          type,
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

  if (ready && !member) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="card p-6">
          <h1 className="text-lg font-bold text-ink">Who is submitting?</h1>
          <p className="mt-1 text-sm text-muted">
            Pick your name so the points land in the right place.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMemberId(m.id)}
                className="btn-secondary btn-sm"
              >
                {m.name}
              </button>
            ))}
          </div>
          {members.length === 0 && (
            <p className="mt-4 text-sm text-muted">
              No members yet —{" "}
              <Link href="/admin" className="link">
                add the team in Admin
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Add a contribution</h1>
        <p className="mt-1 text-sm text-muted">
          Share an AI find. It gets checked against the web, compared with
          earlier submissions, and scored out of 100.
        </p>
      </div>

      <form onSubmit={onSubmit} className="card space-y-5 p-6">
        <div>
          <label className="label" htmlFor="title">
            Title
          </label>
          <input
            id="title"
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Anthropic releases Claude Opus 5"
            maxLength={200}
            required
            disabled={busy}
          />
        </div>

        <div>
          <label className="label" htmlFor="url">
            URL / source
          </label>
          <input
            id="url"
            className="field"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            required
            disabled={busy}
          />
          <p className="hint">
            Link the original announcement, docs or paper if you can — official
            sources score higher than a repost.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="type">
            Contribution type
          </label>
          <select
            id="type"
            className="field"
            value={type}
            onChange={(e) => setType(e.target.value)}
            disabled={busy}
          >
            {CONTRIBUTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="description">
            What did you find?
          </label>
          <textarea
            id="description"
            className="field min-h-24 resize-y"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A short description of the news, tool or paper."
            maxLength={2000}
            disabled={busy}
          />
        </div>

        <div>
          <label className="label" htmlFor="why">
            Why is this useful?
          </label>
          <textarea
            id="why"
            className="field min-h-28 resize-y"
            value={whyUseful}
            onChange={(e) => setWhyUseful(e.target.value)}
            placeholder="Your own take — what would you use it for?"
            maxLength={2000}
            disabled={busy}
          />
          <div className="hint space-y-1">
            <p>This is where your personal contribution points come from.</p>
            <p>
              <span className="font-semibold text-ink">Weak:</span> “This is a
              new AI tool.”
            </p>
            <p>
              <span className="font-semibold text-ink">Strong:</span> “I tested
              it on our dataset and it cut the manual preprocessing — useful for
              the next team project.”
            </p>
          </div>
        </div>

        {error && (
          <p
            className="rounded-lg px-3 py-2.5 text-sm"
            style={{
              color: "var(--error)",
              background: "color-mix(in srgb, var(--error) 10%, transparent)",
            }}
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="flex items-center gap-3 border-t border-line pt-5">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Evaluating…" : "Evaluate"}
          </button>
          <Link href="/" className="btn-ghost">
            Cancel
          </Link>
          {member && (
            <span className="ml-auto text-xs text-muted">
              Submitting as{" "}
              <span className="font-semibold text-ink">{member.name}</span>
            </span>
          )}
        </div>

        {busy && (
          <div className="rounded-lg border border-line bg-brand-soft p-4">
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
      </form>
    </div>
  );
}
