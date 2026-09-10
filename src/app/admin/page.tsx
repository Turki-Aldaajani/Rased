"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useCurrentUser } from "@/components/CurrentUser";
import { DuplicateBadge, VerificationBadge } from "@/components/contribution";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  effectiveDuplicate,
  effectiveScore,
  type Contribution,
  type DuplicateStatus,
  type Member,
} from "@/lib/db/schema";
import { formatDate } from "@/lib/util/date";
import { cn } from "@/lib/utils";

const PASS_KEY = "rased:admin";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground transition-colors duration-200 focus-visible:border-ring focus-visible:outline-none";

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
      <div className="mx-auto max-w-sm py-10">
        <Card className="p-5">
          <form onSubmit={signIn} className="space-y-4">
            <div>
              <h1 className="text-base font-semibold text-foreground">
                Host area
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter the shared passcode to manage the team and correct scores.
              </p>
            </div>
            <Input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Passcode"
              autoFocus
            />
            {authError && (
              <p className="text-sm" style={{ color: "var(--destructive)" }}>
                {authError}
              </p>
            )}
            <Button type="submit" className="w-full">
              Unlock
            </Button>
            <p className="text-xs text-muted-foreground">
              Set it with <code className="font-mono">ADMIN_PASSCODE</code> in{" "}
              <code className="font-mono">.env.local</code>.
            </p>
          </form>
        </Card>
      </div>
    );
  }

  const active = members.filter((m) => m.active);
  const inactive = members.filter((m) => !m.active);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Host area
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Automatic scoring is the default — you have the final word.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="ml-auto">
          <Link href="/leaderboard">View rankings</Link>
        </Button>
      </div>

      {message && (
        <p className="text-sm" style={{ color: "var(--destructive)" }}>
          {message}
        </p>
      )}

      {/* Team members */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-foreground">Team members</h2>
        <form
          className="mt-4 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            const ok = await send("/api/members", "POST", { name: newName });
            if (ok) setNewName("");
          }}
        >
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Add a name…"
            maxLength={40}
          />
          <Button type="submit" disabled={busy} className="shrink-0">
            Add
          </Button>
        </form>

        <ul className="mt-4 divide-y divide-border">
          {active.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              busy={busy}
              count={contributions.filter((c) => c.memberId === m.id).length}
              onRename={(name) =>
                send(`/api/members/${m.id}`, "PATCH", { name })
              }
              onRemove={() => send(`/api/members/${m.id}`, "DELETE")}
            />
          ))}
        </ul>

        {inactive.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">Removed</p>
            <ul className="mt-2 space-y-1">
              {inactive.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  {m.name}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    disabled={busy}
                    onClick={() =>
                      send(`/api/members/${m.id}`, "PATCH", { active: true })
                    }
                  >
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* Submissions */}
      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">
            All submissions
          </h2>
          <p className="text-xs text-muted-foreground">
            {contributions.length} total · override a score when the evaluator
            gets it wrong
          </p>
        </div>
        {contributions.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">
            Nothing submitted yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
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
      </Card>
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
          <Input
            className="max-w-48"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
          />
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              onRename(name);
              setEditing(false);
            }}
          >
            Save
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setName(member.name);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </>
      ) : (
        <>
          <span className="text-sm text-foreground">{member.name}</span>
          <span className="text-xs text-muted-foreground">
            {count} contribution{count === 1 ? "" : "s"}
          </span>
          <span className="ml-auto flex gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href={`/profile/${member.id}`}>Profile</Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              Rename
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={onRemove}
              style={{ color: "var(--destructive)" }}
            >
              Remove
            </Button>
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
    <li className={cn(c.removed && "opacity-50")}>
      <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
          {current}
        </span>
        <div className="min-w-0 flex-1">
          <Link
            href={`/result/${c.id}`}
            className="block truncate text-sm text-foreground hover:underline"
          >
            {c.title}
          </Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="text-foreground">{c.memberName}</span>
            <span>{c.type}</span>
            <span>{formatDate(c.createdAt)}</span>
            {c.removed && <span>removed</span>}
            {overridden && (
              <span>overridden from {c.evaluation.finalScore}</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <VerificationBadge status={c.evaluation.verified} compact />
          <DuplicateBadge status={effectiveDuplicate(c)} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Close" : "Edit"}
          </Button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border bg-muted px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor={`score-${c.id}`}>Score (0–100)</Label>
              <Input
                id={`score-${c.id}`}
                type="number"
                min={0}
                max={100}
                value={score}
                onChange={(e) => setScore(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor={`dup-${c.id}`}>Duplicate status</Label>
              <select
                id={`dup-${c.id}`}
                className={SELECT_CLASS}
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
              <Label htmlFor={`note-${c.id}`}>Note (shown publicly)</Label>
              <Input
                id={`note-${c.id}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why you changed it"
                maxLength={200}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
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
            </Button>
            {overridden && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  send(`/api/contributions/${c.id}`, "PATCH", { clear: true })
                }
              >
                Reset to AI score ({c.evaluation.finalScore})
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              disabled={busy}
              onClick={() =>
                send(`/api/contributions/${c.id}`, "PATCH", {
                  removed: !c.removed,
                })
              }
              style={{
                color: c.removed ? "var(--success)" : "var(--destructive)",
              }}
            >
              {c.removed ? "Restore submission" : "Remove submission"}
            </Button>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            AI reasoning: {c.evaluation.reason}
          </p>
        </div>
      )}
    </li>
  );
}
