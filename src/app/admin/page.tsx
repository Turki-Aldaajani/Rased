"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useCurrentUser } from "@/components/CurrentUser";
import {
  CATEGORY_LABELS,
  DuplicateBadge,
  STATUS_META,
  StatusBadge,
  VerificationBadge,
  categoryLabel,
} from "@/components/contribution";
import { CycleEndCard } from "@/components/admin/CycleEndCard";
import { DiamondRule } from "@/components/brand/DiamondRule";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BONUS, POINTS } from "@/lib/config/rules";
import {
  BONUS_REQUIREMENTS,
  CONTRIBUTION_STATUSES,
  DUPLICATE_OUTCOMES,
  NEWSLETTER_CATEGORIES,
  bonusPending,
  editorialScore,
  effectiveBonus,
  effectiveCategory,
  effectiveDuplicate,
  effectivePoints,
  effectiveStatus,
  type BonusRequirement,
  type Contribution,
  type ContributionStatus,
  type DuplicateOutcome,
  type Member,
  type NewsletterCategory,
} from "@/lib/db/schema";
import {
  REQUIREMENT_LABELS,
  SKIP_REASON_LABELS,
  ruleForSection,
  valueForRequirement,
} from "@/lib/services/bonus";
import { isEarningStatus } from "@/lib/services/points";
import { contributionsCount, formatPoints, membersCount } from "@/lib/util/ar";
import { cycleLabel, formatDate } from "@/lib/util/date";
import { hostname } from "@/lib/util/text";
import { cn } from "@/lib/utils";

const PASS_KEY = "rased:admin";

const SELECT_CLASS =
  "h-9 w-full cursor-pointer rounded-md border border-input bg-card px-3 text-sm text-foreground transition-colors duration-200 hover:border-border-strong focus-visible:border-ring focus-visible:outline-none";

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
  // Bumped when the cycle calendar changes, so cycle labels below re-render.
  const [, setCalendarVersion] = useState(0);

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
      setAuthError("رمز الدخول غير صحيح.");
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

  const onCalendarChange = useCallback(() => {
    setCalendarVersion((v) => v + 1);
    // A moved boundary re-keys contributions; show them where they now sit.
    void load();
  }, [load]);

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
          setMessage(data.error ?? "لم ينجح ذلك.");
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
                منطقة المضيف
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                أدخل رمز الدخول المشترك لإدارة الفريق وتصحيح التقييمات.
              </p>
            </div>
            <Input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="رمز الدخول"
              autoFocus
            />
            {authError && (
              <p className="text-sm" style={{ color: "var(--destructive)" }}>
                {authError}
              </p>
            )}
            <Button type="submit" className="w-full">
              فتح
            </Button>
            <p className="text-xs text-muted-foreground">
              اضبطه عبر <code className="font-mono">ADMIN_PASSCODE</code> في{" "}
              <code className="font-mono">.env.local</code>.
            </p>
          </form>
        </Card>
      </div>
    );
  }

  const active = members.filter((m) => m.active);
  const inactive = members.filter((m) => !m.active);
  const pending = contributions.filter((c) => effectiveStatus(c) === "pending");
  // Every bonus is proposed by the evaluator and granted by a person. Until
  // someone here decides, none of it is on the board.
  const awaitingBonus = contributions.filter(bonusPending);
  // The source refused a machine read, so only a person can settle these.
  // They leave this group the moment a host decides (the override wins).
  const needsReview = contributions.filter(
    (c) => effectiveStatus(c) === "blocked_source" && !c.removed,
  );
  const listed = contributions.filter((c) => !needsReview.includes(c));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-serif-display text-xl font-semibold tracking-tight text-foreground">
            منطقة المضيف
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            التقييم التلقائي هو الافتراضي، ولك الكلمة الأخيرة في كل شيء.
          </p>
          <DiamondRule className="mt-4 max-w-sm" />
        </div>
        <div className="ms-auto flex gap-2">
          <Button asChild size="sm">
            <Link href="/admin/newsletter">النشرة</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/leaderboard">عرض الترتيب</Link>
          </Button>
        </div>
      </div>

      <CycleEndCard passcode={passcode} onChange={onCalendarChange} />

      {message && (
        <p className="text-sm" style={{ color: "var(--destructive)" }}>
          {message}
        </p>
      )}

      {needsReview.length > 0 && (
        <SpotlightCard>
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-foreground">
              تحتاج مراجعتك اليدوية
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {contributionsCount(needsReview.length)} منع مصدرها القراءة
              الآلية. لن تُقيَّم آليًا، فافتح الرابط بنفسك ثم قرّر.
            </p>
          </div>
          <ul className="divide-y divide-border">
            {needsReview.map((c) => (
              <AdminContributionRow
                key={c.id}
                contribution={c}
                busy={busy}
                send={send}
              />
            ))}
          </ul>
        </SpotlightCard>
      )}

      {awaitingBonus.length > 0 && (
        <SpotlightCard>
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-foreground">
              بونص بانتظار تأكيدك
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {contributionsCount(awaitingBonus.length)} اقترح لها رصد بونصًا
              على نص العضو. لا شيء منها يدخل اللوحة قبل أن تقرّر.
            </p>
          </div>
          <ul className="divide-y divide-border">
            {awaitingBonus.map((c) => (
              <AdminContributionRow
                key={c.id}
                contribution={c}
                busy={busy}
                send={send}
                startOpen
              />
            ))}
          </ul>
        </SpotlightCard>
      )}

      {pending.length > 0 && (
        <SpotlightCard className="p-5">
          <h2 className="text-sm font-semibold text-foreground">
            بانتظار إعادة التقييم
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {contributionsCount(pending.length)} لم يكتمل تقييمها، محفوظة بلا
            نقاط حتى تنجح إعادة المحاولة.
          </p>
          <ul className="mt-3 space-y-2">
            {pending.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/result/${c.id}`}
                  className="min-w-0 flex-1 truncate text-sm text-foreground hover:underline"
                >
                  {c.title}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {c.memberName}
                </span>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => send(`/api/contributions/${c.id}/retry`, "POST")}
                >
                  أعد التقييم
                </Button>
              </li>
            ))}
          </ul>
        </SpotlightCard>
      )}

      {/* Team members */}
      <SpotlightCard className="p-5">
        <h2 className="text-sm font-semibold text-foreground">أعضاء الفريق</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {membersCount(active.length)} نشط، فريق الذكاء الاصطناعي تسعة أعضاء،
          أضف من ينقص.
        </p>
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
            placeholder="أضف اسمًا…"
            maxLength={40}
          />
          <Button type="submit" disabled={busy} className="shrink-0">
            إضافة
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
            <p className="text-xs text-muted-foreground">مُزالون</p>
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
                    className="ms-auto"
                    disabled={busy}
                    onClick={() =>
                      send(`/api/members/${m.id}`, "PATCH", { active: true })
                    }
                  >
                    استعادة
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </SpotlightCard>

      {/* Submissions */}
      <SpotlightCard>
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">
            كل المساهمات
          </h2>
          <p className="text-xs text-muted-foreground">
            {contributions.length} إجمالًا
            {needsReview.length > 0 &&
              ` (${needsReview.length} منها في قسم المراجعة اليدوية أعلاه)`}{" "}
            · صحّح الحالة أو التصنيف أو النقاط إذا أخطأ التقييم التلقائي
          </p>
        </div>
        {listed.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">
            {contributions.length === 0
              ? "لا توجد مساهمات بعد."
              : "كل المساهمات في قسم المراجعة اليدوية أعلاه."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {listed.map((c) => (
              <AdminContributionRow
                key={c.id}
                contribution={c}
                busy={busy}
                send={send}
              />
            ))}
          </ul>
        )}
      </SpotlightCard>
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
            حفظ
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setName(member.name);
              setEditing(false);
            }}
          >
            إلغاء
          </Button>
        </>
      ) : (
        <>
          <span className="text-sm text-foreground">{member.name}</span>
          <span className="text-xs text-muted-foreground">
            {contributionsCount(count)}
            {member.focusArea && ` · ${categoryLabel(member.focusArea)}`}
          </span>
          <span className="ms-auto flex gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href={`/profile/${member.id}`}>الملف</Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              إعادة تسمية
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={onRemove}
              style={{ color: "var(--destructive)" }}
            >
              إزالة
            </Button>
          </span>
        </>
      )}
    </li>
  );
}

/**
 * The bonus review.
 *
 * The evaluator can tell that a member wrote something; it cannot tell that
 * they wrote it themselves, or that steps for a tool are steps and not the
 * tool's own blurb. So it proposes, this decides, and the board only ever
 * counts what was decided here.
 */
function BonusReview({
  contribution: c,
  busy,
  send,
}: {
  contribution: Contribution;
  busy: boolean;
  send: (url: string, method: string, body?: unknown) => Promise<boolean>;
}) {
  const bonus = c.bonus;
  const sectionRule = ruleForSection(effectiveCategory(c));
  const fallback =
    bonus.requirement ?? bonus.suggested?.requirement ?? sectionRule?.requirement ?? null;

  const [requirement, setRequirement] = useState<BonusRequirement | "">(
    fallback ?? "",
  );
  const [value, setValue] = useState(
    String(
      bonus.awarded ||
        bonus.suggested?.value ||
        (fallback ? valueForRequirement(fallback) : 0),
    ),
  );
  const [note, setNote] = useState(bonus.note);

  const decided = bonus.status === "confirmed" || bonus.status === "rejected";

  return (
    <div className="mt-4 border-t border-border pt-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-xs font-semibold text-foreground">البونص</p>
        {bonus.status === "pending" && bonus.suggested && (
          <p className="text-xs" style={{ color: "var(--accent)" }}>
            بونص مقترح: {REQUIREMENT_LABELS[bonus.suggested.requirement]} +
            {formatPoints(bonus.suggested.value)}، بانتظار تأكيد الإدارة
          </p>
        )}
        {bonus.status === "confirmed" && (
          <p className="text-xs" style={{ color: "var(--success)" }}>
            مؤكَّد: {bonus.requirement ? REQUIREMENT_LABELS[bonus.requirement] : "بونص"}{" "}
            +{formatPoints(bonus.awarded)}
          </p>
        )}
        {bonus.status === "rejected" && (
          <p className="text-xs" style={{ color: "var(--destructive)" }}>
            مرفوض، لا يُحتسب.
          </p>
        )}
        {bonus.status === "none" && (
          <p className="text-xs text-muted-foreground">
            {bonus.skipped
              ? SKIP_REASON_LABELS[bonus.skipped]
              : "لا بونص مقترح."}
          </p>
        )}
      </div>

      {bonus.suggested?.reason && (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {bonus.suggested.reason}
        </p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label htmlFor={`breq-${c.id}`}>نوع البونص</Label>
          <select
            id={`breq-${c.id}`}
            className={SELECT_CLASS}
            value={requirement}
            onChange={(e) => {
              const next = e.target.value as BonusRequirement | "";
              setRequirement(next);
              if (next) setValue(String(valueForRequirement(next)));
            }}
          >
            <option value="">بلا بونص</option>
            {BONUS_REQUIREMENTS.map((r) => (
              <option key={r} value={r}>
                {REQUIREMENT_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor={`bval-${c.id}`}>
            القيمة (0–{BONUS.maxManual})
          </Label>
          <Input
            id={`bval-${c.id}`}
            type="number"
            min={0}
            max={BONUS.maxManual}
            step={0.5}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor={`bnote-${c.id}`}>سبب القرار (اختياري)</Label>
          <Input
            id={`bnote-${c.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="يظهر مع المساهمة"
            maxLength={200}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy || !requirement}
          onClick={() =>
            send(`/api/contributions/${c.id}`, "PATCH", {
              bonus: {
                decision: "confirm",
                requirement,
                value: Number(value),
                note,
              },
            })
          }
        >
          تأكيد البونص
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            send(`/api/contributions/${c.id}`, "PATCH", {
              bonus: { decision: "reject", note },
            })
          }
        >
          رفض البونص
        </Button>
        {decided && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() =>
              send(`/api/contributions/${c.id}`, "PATCH", {
                bonus: { decision: "reset" },
              })
            }
          >
            إعادة إلى الاقتراح
          </Button>
        )}
      </div>
    </div>
  );
}

function AdminContributionRow({
  contribution: c,
  busy,
  send,
  startOpen = false,
}: {
  contribution: Contribution;
  busy: boolean;
  send: (url: string, method: string, body?: unknown) => Promise<boolean>;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  // A source the machine could not read has no automatic answer to correct,
  // so the decision starts empty instead of pre-filled with "waiting".
  const awaitingReview = effectiveStatus(c) === "blocked_source";
  const [status, setStatus] = useState<ContributionStatus | "">(
    awaitingReview ? "" : effectiveStatus(c),
  );
  const [points, setPoints] = useState(String(effectivePoints(c)));
  const [category, setCategory] = useState<NewsletterCategory | "">(
    effectiveCategory(c) ?? "",
  );
  const [duplicate, setDuplicate] = useState<DuplicateOutcome>(
    effectiveDuplicate(c),
  );
  const [note, setNote] = useState(c.adminOverride?.note ?? "");

  const overridden = Boolean(c.adminOverride);

  return (
    <li className={cn(c.removed && "opacity-50")}>
      <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        <span
          className="w-8 shrink-0 text-end text-sm font-semibold tabular-nums"
          style={{
            color:
              effectivePoints(c) > 0
                ? "var(--primary)"
                : "var(--muted-foreground)",
          }}
        >
          {effectivePoints(c) + effectiveBonus(c) > 0
            ? `+${formatPoints(effectivePoints(c) + effectiveBonus(c))}`
            : "0"}
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
            <span>{categoryLabel(effectiveCategory(c))}</span>
            <span>{formatDate(c.createdAt)}</span>
            <span>{cycleLabel(c.cycleKey)}</span>
            {awaitingReview ? (
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-foreground underline-offset-4 hover:underline"
              >
                افتح المصدر ({hostname(c.url) || c.url})
              </a>
            ) : (
              <span>تحريريًا {editorialScore(c)}</span>
            )}
            {c.bonus.status === "pending" && (
              <span style={{ color: "var(--accent)" }}>بونص بانتظار التأكيد</span>
            )}
            {c.bonus.status === "confirmed" && (
              <span style={{ color: "var(--success)" }}>
                بونص +{formatPoints(c.bonus.awarded)}
              </span>
            )}
            {c.removed && <span>مُزالة</span>}
            {overridden && <span>معدّلة</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {c.evaluation && (
            <VerificationBadge status={c.evaluation.verification.status} compact />
          )}
          <StatusBadge status={effectiveStatus(c)} />
          <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? "إغلاق" : awaitingReview ? "راجع" : "تعديل"}
          </Button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border bg-muted px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor={`status-${c.id}`}>الحالة</Label>
              <select
                id={`status-${c.id}`}
                className={SELECT_CLASS}
                value={status}
                onChange={(e) => {
                  const next = e.target.value as ContributionStatus;
                  setStatus(next);
                  // The one decision that always carries a point (or none), so
                  // the host does not have to remember to type it as well.
                  if (awaitingReview) {
                    setPoints(String(isEarningStatus(next) ? POINTS.perValidContribution : 0));
                  }
                }}
              >
                {awaitingReview && (
                  <option value="" disabled>
                    اختر القرار
                  </option>
                )}
                {CONTRIBUTION_STATUSES.filter(
                  (s) => s !== "blocked_source",
                ).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].text}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor={`points-${c.id}`}>
                نقطة الأساس (0–{POINTS.maxBasePerCycle})
              </Label>
              <Input
                id={`points-${c.id}`}
                type="number"
                min={0}
                max={POINTS.maxBasePerCycle}
                value={points}
                onChange={(e) => setPoints(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor={`cat-${c.id}`}>التصنيف</Label>
              <select
                id={`cat-${c.id}`}
                className={SELECT_CLASS}
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as NewsletterCategory)
                }
              >
                <option value="">بلا تغيير</option>
                {NEWSLETTER_CATEGORIES.map((k) => (
                  <option key={k} value={k}>
                    {CATEGORY_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor={`dup-${c.id}`}>حالة التكرار</Label>
              <select
                id={`dup-${c.id}`}
                className={SELECT_CLASS}
                value={duplicate}
                onChange={(e) =>
                  setDuplicate(e.target.value as DuplicateOutcome)
                }
              >
                {DUPLICATE_OUTCOMES.map((d) => (
                  <option key={d} value={d}>
                    {d === "unique"
                      ? "فريدة"
                      : d === "same_topic_new_value"
                        ? "نفس الموضوع بقيمة جديدة"
                        : "مكررة"}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Label htmlFor={`note-${c.id}`}>ملاحظة (تظهر للجميع)</Label>
              <Input
                id={`note-${c.id}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="سبب التعديل"
                maxLength={200}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy || !status}
              onClick={async () => {
                const ok = await send(`/api/contributions/${c.id}`, "PATCH", {
                  status,
                  points: Number(points),
                  primaryCategory: category || null,
                  duplicateOutcome: duplicate,
                  note,
                });
                if (ok) setOpen(false);
              }}
            >
              حفظ التعديل
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
                إعادة إلى تقييم رصد
              </Button>
            )}
            {effectiveStatus(c) === "pending" && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  send(`/api/contributions/${c.id}/retry`, "POST")
                }
              >
                إعادة التقييم
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="ms-auto"
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
              {c.removed ? "استعادة المساهمة" : "إزالة المساهمة"}
            </Button>
          </div>

          <BonusReview contribution={c} busy={busy} send={send} />

          {c.evaluation && (
            <div className="mt-4 space-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
              <p>تقييم رصد: {c.evaluation.summaryForMember}</p>
              <p className="flex flex-wrap items-center gap-2">
                <DuplicateBadge
                  outcome={c.evaluation.duplicate.outcome}
                  always
                />
                {c.evaluation.duplicate.reason}
              </p>
              {c.evaluation.duplicate.matches.length > 0 && (
                <div>
                  <p>المساهمات التي قورنت بها:</p>
                  <ul className="mt-1 space-y-0.5">
                    {c.evaluation.duplicate.matches.map((m) => (
                      <li key={m.id}>
                        <Link
                          href={`/result/${m.id}`}
                          className="hover:text-foreground hover:underline"
                        >
                          {Math.round(m.score * 100)}٪، {m.title} (
                          {m.memberName})
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {c.evaluation.rejectionReason && (
                <p>سبب الرفض: {c.evaluation.rejectionReason}</p>
              )}
            </div>
          )}
          {c.evaluationError && (
            <p
              className={cn(
                "mt-3 text-xs",
                awaitingReview && "text-muted-foreground",
              )}
              style={awaitingReview ? undefined : { color: "var(--destructive)" }}
            >
              {awaitingReview
                ? `ما ردّ به المصدر: ${c.evaluationError}`
                : `خطأ التقييم: ${c.evaluationError}`}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
