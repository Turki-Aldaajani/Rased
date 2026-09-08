"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useCurrentUser } from "@/components/CurrentUser";
import { DuplicateBadge, VerificationBadge, scoreColor } from "@/components/ui";
import {
  effectiveDuplicate,
  effectiveScore,
  type Contribution,
  type DuplicateStatus,
  type Member,
} from "@/lib/db/schema";
import { formatDate } from "@/lib/util/date";

const PASS_KEY = "ai-hunt:admin";

export default function AdminPage() {
  const { refresh: refreshMembers } = useCurrentUser();
  const [passcode, setPasscode] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [members, setMembers] = useState<Member[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [m, c] = await Promise.all([
      fetch("/api/members?all=1", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/contributions?all=1", { cache: "no-store" }).then((r) =>
        r.json(),
      ),
    ]);
    setMembers(m.members ?? []);
    setContributions(c.contributions ?? []);
  }, []);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(PASS_KEY);
    } catch {
      /* ignore */
    }
    if (!stored) return;
    (async () => {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: stored }),
      });
      if (res.ok) {
        setPasscode(stored);
        setAuthed(true);
        await load();
      }
    })();
  }, [load]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    const res = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    if (!res.ok) {
      setAuthError("Wrong passcode.");
      return;
    }
    try {
      sessionStorage.setItem(PASS_KEY, passcode);
    } catch {
      /* ignore */
    }
    setAuthed(true);
    await load();
  }

  /** Every admin mutation goes through here so the passcode header is never forgotten. */
  const send = useCallback(
    async (url: string, method: string, body?: unknown) => {
      setBusy(true);
      setMessage(null);
      try {
        const res = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            "x-admin-passcode": passcode,
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setMessage(data.error ?? "That did not work.");
          return false;
        }
        await load();
        await refreshMembers();
        return true;
      } finally {
        setBusy(false);
      }
    },
    [passcode, load, refreshMembers],
  );

  if (!authed) {
    return (
      <div className="mx-auto max-w-sm">
        <form onSubmit={signIn} className="card space-y-4 p-6">
          <div>
            <h1 className="text-lg font-bold text-ink">Host area</h1>
            <p className="mt-1 text-sm text-muted">
              Enter the shared passcode to manage the team and correct scores.
            </p>
          </div>
          <input
            className="field"
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Passcode"
            autoFocus
          />
          {authError && (
            <p className="text-sm" style={{ color: "var(--error)" }}>
              {authError}
            </p>
          )}
          <button type="submit" className="btn-primary w-full">
            Unlock
          </button>
          <p className="hint">
            Set it with <code className="font-mono">ADMIN_PASSCODE</code> in
            <code className="font-mono"> .env.local</code> (default:{" "}
            <code className="font-mono">aihunt</code>).
          </p>
        </form>
      </div>
    );
  }

  const active = members.filter((m) => m.active);
  const inactive = members.filter((m) => !m.active);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Host area</h1>
          <p className="mt-1 text-sm text-muted">
            Automatic scoring is the default — you have the final word.
          </p>
        </div>
        <Link href="/leaderboard" className="btn-secondary btn-sm ml-auto">
          View rankings
        </Link>
      </div>

      {message && (
        <p
          className="rounded-lg px-3 py-2.5 text-sm"
          style={{
            color: "var(--error)",
            background: "color-mix(in srgb, var(--error) 10%, transparent)",
          }}
        >
          {message}
        </p>
      )}

      {/* Team members */}
      <section className="card p-6">
        <h2 className="text-base font-bold text-ink">Team members</h2>
        <form
          className="mt-4 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            const ok = await send("/api/members", "POST", { name: newName });
            if (ok) setNewName("");
          }}
        >
          <input
            className="field"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Add a name…"
            maxLength={40}
          />
          <button className="btn-primary shrink-0" disabled={busy}>
            Add
          </button>
        </form>

        <ul className="mt-4 divide-y divide-line">
          {active.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              busy={busy}
              count={contributions.filter((c) => c.memberId === m.id).length}
              onRename={(name) => send(`/api/members/${m.id}`, "PATCH", { name })}
              onRemove={() => send(`/api/members/${m.id}`, "DELETE")}
            />
          ))}
        </ul>

        {inactive.length > 0 && (
          <div className="mt-4 border-t border-line pt-4">
            <p className="section-title">Removed</p>
            <ul className="mt-2 space-y-1">
              {inactive.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-2 text-sm text-muted"
                >
                  {m.name}
                  <button
                    className="btn-ghost btn-sm ml-auto"
                    disabled={busy}
                    onClick={() =>
                      send(`/api/members/${m.id}`, "PATCH", { active: true })
                    }
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Submissions */}
      <section className="card overflow-hidden">
        <div className="border-b border-line px-6 py-4">
          <h2 className="text-base font-bold text-ink">All submissions</h2>
          <p className="text-xs text-muted">
            {contributions.length} total · override a score when the evaluator
            gets it wrong
          </p>
        </div>
        {contributions.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted">Nothing submitted yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {contributions.map((c) => (
              <AdminContributionRow
                key={c.id}
                contribution={c}
                busy={busy}
                send={send}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MemberRow({
  member,
  count,
  busy,
  onRename,
  onRemove,
}: {
  member: Member;
  count: number;
  busy: boolean;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(member.name);

  return (
    <li className="flex flex-wrap items-center gap-2 py-2.5">
      {editing ? (
        <>
          <input
            className="field max-w-48"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
          />
          <button
            className="btn-primary btn-sm"
            disabled={busy}
            onClick={() => {
              onRename(name);
              setEditing(false);
            }}
          >
            Save
          </button>
          <button
            className="btn-ghost btn-sm"
            onClick={() => {
              setName(member.name);
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <span
            className="grid h-7 w-7 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand-ink"
            aria-hidden
          >
            {member.name.charAt(0)}
          </span>
          <span className="text-sm font-semibold text-ink">{member.name}</span>
          <span className="text-xs text-muted">
            {count} contribution{count === 1 ? "" : "s"}
          </span>
          <span className="ml-auto flex gap-1">
            <Link href={`/profile/${member.id}`} className="btn-ghost btn-sm">
              Profile
            </Link>
            <button
              className="btn-ghost btn-sm"
              onClick={() => setEditing(true)}
            >
              Rename
            </button>
            <button
              className="btn-ghost btn-sm"
              disabled={busy}
              onClick={onRemove}
              style={{ color: "var(--error)" }}
            >
              Remove
            </button>
          </span>
        </>
      )}
    </li>
  );
}

function AdminContributionRow({
  contribution: c,
  busy,
  send,
}: {
  contribution: Contribution;
  busy: boolean;
  send: (url: string, method: string, body?: unknown) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState(String(effectiveScore(c)));
  const [duplicate, setDuplicate] = useState<DuplicateStatus>(
    effectiveDuplicate(c),
  );
  const [note, setNote] = useState(c.adminOverride?.note ?? "");

  const current = effectiveScore(c);
  const overridden = c.adminOverride?.score != null;

  return (
    <li className={c.removed ? "opacity-50" : ""}>
      <div className="flex flex-wrap items-center gap-3 px-6 py-3">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-bold"
          style={{
            color: scoreColor(current),
            background: `color-mix(in srgb, ${scoreColor(current)} 12%, transparent)`,
          }}
        >
          {current}
        </span>
        <div className="min-w-0 flex-1">
          <Link
            href={`/result/${c.id}`}
            className="block truncate text-sm font-semibold text-ink hover:underline"
          >
            {c.title}
          </Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <span className="font-semibold text-interactive-ink">
              {c.memberName}
            </span>
            <span>{c.type}</span>
            <span>{formatDate(c.createdAt)}</span>
            {c.removed && (
              <span className="font-semibold" style={{ color: "var(--error)" }}>
                removed
              </span>
            )}
            {overridden && (
              <span className="font-semibold text-accent-ink">
                overridden from {c.evaluation.finalScore}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <VerificationBadge status={c.evaluation.verified} compact />
          <DuplicateBadge status={effectiveDuplicate(c)} />
          <button
            className="btn-secondary btn-sm"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Close" : "Edit"}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-line bg-brand-soft px-6 py-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label text-xs">Score (0–100)</label>
              <input
                className="field"
                type="number"
                min={0}
                max={100}
                value={score}
                onChange={(e) => setScore(e.target.value)}
              />
            </div>
            <div>
              <label className="label text-xs">Duplicate status</label>
              <select
                className="field"
                value={duplicate}
                onChange={(e) =>
                  setDuplicate(e.target.value as DuplicateStatus)
                }
              >
                <option value="original">Original</option>
                <option value="partial">Partially duplicate</option>
                <option value="duplicate">Duplicate</option>
              </select>
            </div>
            <div>
              <label className="label text-xs">Note (shown publicly)</label>
              <input
                className="field"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why you changed it"
                maxLength={200}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="btn-primary btn-sm"
              disabled={busy}
              onClick={async () => {
                const ok = await send(`/api/contributions/${c.id}`, "PATCH", {
                  score: Number(score),
                  duplicate,
                  note,
                });
                if (ok) setOpen(false);
              }}
            >
              Save override
            </button>
            {overridden && (
              <button
                className="btn-secondary btn-sm"
                disabled={busy}
                onClick={() =>
                  send(`/api/contributions/${c.id}`, "PATCH", { clear: true })
                }
              >
                Reset to AI score ({c.evaluation.finalScore})
              </button>
            )}
            <button
              className="btn-secondary btn-sm ml-auto"
              disabled={busy}
              onClick={() =>
                send(`/api/contributions/${c.id}`, "PATCH", {
                  removed: !c.removed,
                })
              }
              style={{ color: c.removed ? "var(--success)" : "var(--error)" }}
            >
              {c.removed ? "Restore submission" : "Remove submission"}
            </button>
          </div>

          <p className="mt-3 text-xs text-muted">
            AI reasoning: {c.evaluation.reason}
          </p>
        </div>
      )}
    </li>
  );
}
