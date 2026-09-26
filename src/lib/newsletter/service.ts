import { randomUUID } from "crypto";
import {
  DIFFICULTIES,
  effectiveCategory,
  effectivePoints,
  editorialScore,
  type Contribution,
  type Database,
  type Difficulty,
} from "@/lib/db/schema";
import {
  deleteIssue,
  getIssue,
  insertIssue,
  listAllMembers,
  listIssues,
  listMembers,
  readDb,
  updateIssue,
} from "@/lib/db/store";
import { cycleLeaderboard, knownCycles } from "@/lib/services/leaderboard";
import { cycleEnd, cycleKey, cycleLabel, cycleStart } from "@/lib/util/date";
import { truncate } from "@/lib/util/text";
import { issueSlug, monthOf } from "./format";
import { newsletterAiEnabled, writeSection } from "./generate";
import { LEGACY_ISSUES } from "./legacy";
import { resolvePublisher } from "./publish";
import { issueUrl, renderArchiveHtml, renderIssueHtml, type ArchiveEntry } from "./render";
import { planIssue, type SelectionPlan } from "./select";
import {
  SECTIONS,
  isSectionId,
  sectionById,
  type SectionId,
} from "./sections";
import type {
  NewsletterIssue,
  NewsletterItem,
  NewsletterSection,
  UnusedContribution,
} from "./types";
import { openWarnings, validateIssue } from "./validate";

/**
 * The newsletter workflow, end to end:
 *
 *   contributions → selection → AI draft → validation → human review → publish
 *
 * Nothing here publishes on its own. `createDraft` and every regenerate call
 * produce a draft; only `publishIssue`, called by an editor, writes anything
 * public, and it will not overwrite an issue that already exists.
 */

export class NewsletterError extends Error {
  constructor(
    message: string,
    public status = 400,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Issue #1's own opening and closing lines, the family's defaults. */
const DEFAULT_TITLE = "نـشـرة الـذكـاء الاصـطـنـاعـي";
const DEFAULT_LEAD =
  "لا نخبرك بكل ما حدث في الذكاء الاصطناعي، بل نختصر لك ما يستحق معرفته وما يمكنك استخدامه.";
const DEFAULT_CLOSING =
  "لا تلاحق كل جديد في الذكاء الاصطناعي.\nتعلّم كيف تستخدم الجديد الذي يستحق وقتك.";

const iso = (d: Date) => d.toISOString().slice(0, 10);

function byIdMap(db: Database): Map<string, Contribution> {
  return new Map(db.contributions.map((c) => [c.id, c]));
}

function nextIssueNumber(db: Database): number {
  const numbers = [
    ...LEGACY_ISSUES.map((l) => l.number),
    ...db.newsletters.map((n) => n.number),
  ];
  return Math.max(0, ...numbers) + 1;
}

function issueForCycle(db: Database, cycle: string) {
  const stored = db.newsletters.find((n) => n.cycleKey === cycle);
  if (stored) return { number: stored.number, id: stored.id as string | null };
  const legacy = LEGACY_ISSUES.find((l) => l.cycleKey === cycle);
  return legacy ? { number: legacy.number, id: null } : null;
}

// ---------------------------------------------------------------------------
// Overview, what the editor sees before and while building an issue
// ---------------------------------------------------------------------------

export interface CycleOverview {
  cycle: string;
  label: string;
  isCurrent: boolean;
  submissions: number;
  eligible: number;
  coverage: { sectionId: SectionId; title: string; eligible: number; selected: number }[];
  selected: {
    contributionId: string;
    title: string;
    memberName: string;
    sectionId: SectionId;
    via: "primary" | "secondary";
    editorialScore: number;
  }[];
  unused: UnusedContribution[];
  contributors: { memberId: string; memberName: string; submissions: number; accepted: number }[];
  leaderboard: { memberName: string; points: number; rank: number }[];
  issue: { number: number; id: string | null } | null;
  nextNumber: number;
  aiEnabled: boolean;
}

export async function cycleOverview(cycle: string): Promise<CycleOverview> {
  const db = await readDb();
  const members = await listMembers();
  const plan = planIssue(db.contributions, cycle);
  const inCycle = db.contributions.filter((c) => !c.removed && c.cycleKey === cycle);

  const contributors = new Map<string, CycleOverview["contributors"][number]>();
  for (const c of inCycle) {
    const row = contributors.get(c.memberId) ?? {
      memberId: c.memberId,
      memberName: c.memberName,
      submissions: 0,
      accepted: 0,
    };
    row.submissions++;
    if (plan.eligible.includes(c)) row.accepted++;
    contributors.set(c.memberId, row);
  }

  return {
    cycle,
    label: cycleLabel(cycle),
    isCurrent: cycle === cycleKey(new Date()),
    submissions: inCycle.length,
    eligible: plan.eligible.length,
    coverage: SECTIONS.map((def) => ({
      sectionId: def.id,
      title: def.title,
      eligible: plan.coverage[def.category],
      selected: plan.placements.filter((p) => p.sectionId === def.id).length,
    })),
    selected: plan.placements.map((p) => ({
      contributionId: p.contribution.id,
      title: p.contribution.title,
      memberName: p.contribution.memberName,
      sectionId: p.sectionId,
      via: p.via,
      editorialScore: editorialScore(p.contribution),
    })),
    unused: plan.unused,
    contributors: [...contributors.values()].sort((a, b) => b.submissions - a.submissions),
    // Shown for context only, points never feed the selection above.
    leaderboard: cycleLeaderboard(members, db.contributions, cycle)
      .filter((r) => r.points > 0)
      .map((r) => ({ memberName: r.memberName, points: r.points, rank: r.rank })),
    issue: issueForCycle(db, cycle),
    nextNumber: nextIssueNumber(db),
    aiEnabled: newsletterAiEnabled(),
  };
}

export async function availableCycles(): Promise<{ key: string; label: string }[]> {
  const db = await readDb();
  return knownCycles(db.contributions).map((key) => ({ key, label: cycleLabel(key) }));
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

interface WrittenSections {
  sections: NewsletterSection[];
  errors: string[];
  engine: "ai" | "source";
}

/** Writes every section of a plan in parallel. A failed section never takes others down. */
async function writePlan(
  plan: SelectionPlan,
  previous: NewsletterSection[] | null,
): Promise<WrittenSections> {
  const results = await Promise.all(
    SECTIONS.map(async (def) => {
      const contributions = plan.placements
        .filter((p) => p.sectionId === def.id)
        .map((p) => p.contribution);
      const out = await writeSection(def.id, contributions);
      const before = previous?.find((s) => s.id === def.id);
      // §29: on failure keep what the editor already had, if anything.
      const items =
        out.error && before && before.items.length > 0 ? before.items : out.items;
      return {
        section: { id: def.id, title: def.title, items, error: out.error },
        out,
      };
    }),
  );
  const ran = results.filter((r) => r.out.items.length > 0);
  return {
    sections: results.map((r) => r.section),
    errors: results.map((r) => r.out.error).filter((e): e is string => Boolean(e)),
    engine: ran.length > 0 && ran.every((r) => r.out.engine === "ai") ? "ai" : "source",
  };
}

export async function createDraft(cycle: string): Promise<NewsletterIssue> {
  const db = await readDb();
  const existing = issueForCycle(db, cycle);
  if (existing) {
    throw new NewsletterError(
      `يوجد عدد لهذه الدورة بالفعل (العدد ${existing.number}).`,
      409,
      { issueId: existing.id },
    );
  }

  const plan = planIssue(db.contributions, cycle);
  if (plan.placements.length === 0) {
    throw new NewsletterError(
      plan.eligible.length === 0
        ? "لا توجد مساهمات مقبولة في هذه الدورة لبناء عدد منها."
        : "لا توجد مساهمات تتجاوز الحد الأدنى للقيمة التحريرية في هذه الدورة.",
      422,
    );
  }

  const written = await writePlan(plan, null);
  const now = new Date().toISOString();

  return insertIssue((live) => {
    // Re-checked under the lock: two editors pressing "generate" at once.
    const clash = issueForCycle(live, cycle);
    if (clash) {
      throw new NewsletterError(
        `يوجد عدد لهذه الدورة بالفعل (العدد ${clash.number}).`,
        409,
        { issueId: clash.id },
      );
    }
    const issue: NewsletterIssue = {
      id: randomUUID(),
      number: nextIssueNumber(live),
      cycleKey: cycle,
      cycleStart: iso(cycleStart(cycle)),
      cycleEnd: iso(cycleEnd(cycle)),
      status: "draft",
      title: DEFAULT_TITLE,
      lead: DEFAULT_LEAD,
      closing: DEFAULT_CLOSING,
      sections: written.sections,
      unused: plan.unused,
      generation: {
        engine: written.engine,
        model: written.engine === "ai" ? process.env.RASED_MODEL || "claude-opus-5" : null,
        at: now,
        errors: written.errors,
      },
      createdAt: now,
      updatedAt: now,
      publication: null,
      editedAfterPublish: false,
    };
    return validateIssue(issue, byIdMap(live));
  });
}

function assertEditable(issue: NewsletterIssue) {
  if (issue.status === "published") {
    throw new NewsletterError(
      "هذا العدد منشور. لا يُعاد توليده حتى لا يُستبدل المنشور بمحتوى جديد، عدّله يدويًا إن لزم.",
      409,
    );
  }
}

export type RegenerateScope =
  | { scope: "issue" }
  | { scope: "section"; sectionId: SectionId }
  | { scope: "item"; itemId: string };

export async function regenerate(
  id: string,
  request: RegenerateScope,
): Promise<{ issue: NewsletterIssue; error: string | null }> {
  const current = await getIssue(id);
  if (!current) throw new NewsletterError("العدد غير موجود.", 404);
  assertEditable(current);
  const db = await readDb();
  const byId = byIdMap(db);

  if (request.scope === "issue") {
    const plan = planIssue(db.contributions, current.cycleKey);
    if (plan.placements.length === 0) {
      throw new NewsletterError("لم يعد في الدورة محتوى صالح للاختيار.", 422);
    }
    const written = await writePlan(plan, current.sections);
    // A section that failed kept its old items; those are not "unused".
    const inIssue = new Set(
      written.sections.flatMap((s) => s.items.map((i) => i.contributionId)),
    );
    const issue = await updateIssue(id, (stored) => {
      assertEditable(stored);
      return validateIssue(
        {
          ...stored,
          sections: written.sections,
          unused: plan.unused.filter((u) => !inIssue.has(u.contributionId)),
          generation: {
            engine: written.engine,
            model: written.engine === "ai" ? process.env.RASED_MODEL || "claude-opus-5" : null,
            at: new Date().toISOString(),
            errors: written.errors,
          },
        },
        byId,
      );
    });
    return { issue: issue!, error: written.errors[0] ?? null };
  }

  if (request.scope === "section") {
    const section = current.sections.find((s) => s.id === request.sectionId);
    if (!section) throw new NewsletterError("القسم غير موجود.", 404);
    const contributions = section.items
      .map((i) => byId.get(i.contributionId))
      .filter((c): c is Contribution => Boolean(c));
    const out = await writeSection(section.id, contributions);
    const issue = await updateIssue(id, (stored) => {
      assertEditable(stored);
      return validateIssue(
        {
          ...stored,
          sections: stored.sections.map((s) =>
            s.id !== section.id
              ? s
              : out.error
                ? { ...s, error: out.error } // keep the draft text on failure
                : { ...s, items: out.items, error: null },
          ),
        },
        byId,
      );
    });
    return { issue: issue!, error: out.error };
  }

  // One item.
  const located = locateItem(current, request.itemId);
  if (!located) throw new NewsletterError("العنصر غير موجود.", 404);
  const contribution = byId.get(located.item.contributionId);
  if (!contribution) {
    throw new NewsletterError("المساهمة الأصلية لهذا العنصر لم تعد موجودة.", 422);
  }
  const out = await writeSection(located.section.id, [contribution]);
  const fresh = out.items[0];
  const issue = await updateIssue(id, (stored) => {
    assertEditable(stored);
    if (out.error || !fresh) return stored;
    return validateIssue(
      replaceItem(stored, request.itemId, { ...fresh, id: request.itemId }),
      byId,
    );
  });
  return { issue: issue!, error: out.error };
}

function locateItem(issue: NewsletterIssue, itemId: string) {
  for (const section of issue.sections) {
    const item = section.items.find((i) => i.id === itemId);
    if (item) return { section, item };
  }
  return null;
}

function replaceItem(
  issue: NewsletterIssue,
  itemId: string,
  next: NewsletterItem,
): NewsletterIssue {
  return {
    ...issue,
    sections: issue.sections.map((s) => ({
      ...s,
      items: s.items.map((i) => (i.id === itemId ? next : i)),
    })),
  };
}

/** "Add an item", always from a real contribution, so it stays traceable. */
export async function addItem(
  id: string,
  contributionId: string,
  sectionId: SectionId,
): Promise<{ issue: NewsletterIssue; error: string | null }> {
  const current = await getIssue(id);
  if (!current) throw new NewsletterError("العدد غير موجود.", 404);
  if (current.status === "published") {
    throw new NewsletterError("العدد منشور، لا تُضاف إليه عناصر.", 409);
  }
  const db = await readDb();
  const contribution = db.contributions.find((c) => c.id === contributionId);
  if (!contribution || contribution.removed || !contribution.evaluation) {
    throw new NewsletterError("المساهمة غير متاحة.", 404);
  }
  if (contribution.cycleKey !== current.cycleKey) {
    throw new NewsletterError("المساهمة من دورة أخرى.", 422);
  }
  if (current.sections.some((s) => s.items.some((i) => i.contributionId === contributionId))) {
    throw new NewsletterError("هذه المساهمة موجودة في العدد بالفعل.", 409);
  }

  const out = await writeSection(sectionId, [contribution]);
  const item = out.items[0];
  const issue = await updateIssue(id, (stored) =>
    validateIssue(
      {
        ...stored,
        sections: stored.sections.map((s) =>
          s.id === sectionId ? { ...s, items: [...s.items, item] } : s,
        ),
        unused: stored.unused.filter((u) => u.contributionId !== contributionId),
      },
      byIdMap(db),
    ),
  );
  return { issue: issue!, error: out.error };
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

const str = (v: unknown, max: number) => truncate(String(v ?? "").trim(), max);
const list = (v: unknown, max: number, each: number) =>
  (Array.isArray(v) ? v : [])
    .map((x) => str(x, each))
    .filter(Boolean)
    .slice(0, max);

const TEXT_FIELDS: [keyof NewsletterItem, number][] = [
  ["title", 200],
  ["headline", 240],
  ["kicker", 60],
  ["whyItMatters", 800],
  ["chip", 80],
  ["fitLabel", 30],
  ["fitText", 300],
  ["ideaLabel", 40],
  ["idea", 500],
  ["exampleLabel", 40],
  ["example", 800],
  ["note", 500],
  ["moral", 400],
  ["platform", 60],
  ["byline", 120],
  ["levelLabel", 40],
  ["ctaLabel", 60],
];

/**
 * Applies an editor's version of an item on top of the stored one. Only
 * editable fields are read; everything that traces the item back to its
 * contribution is kept from the stored copy.
 */
function applyItemEdit(stored: NewsletterItem, input: Json, sectionId: SectionId): NewsletterItem {
  const next: NewsletterItem = { ...stored };
  let changed = false;
  const set = <K extends keyof NewsletterItem>(key: K, value: NewsletterItem[K]) => {
    if (JSON.stringify(stored[key]) !== JSON.stringify(value)) changed = true;
    next[key] = value;
  };

  for (const [key, max] of TEXT_FIELDS) {
    if (key in input) set(key, str(input[key], max) as never);
  }
  if ("paragraphs" in input) set("paragraphs", list(input.paragraphs, 6, 1500));
  if ("prerequisites" in input) set("prerequisites", list(input.prerequisites, 6, 120));
  if ("aiNotes" in input) {
    // Editors can clear the model's notes once they have checked them, not add new ones.
    const keep = list(input.aiNotes, 20, 300).filter((n) => stored.aiNotes.includes(n));
    next.aiNotes = keep;
  }
  if ("difficulty" in input) {
    const d = String(input.difficulty ?? "");
    set(
      "difficulty",
      DIFFICULTIES.includes(d as Difficulty) && d !== "not_applicable"
        ? (d as Difficulty)
        : null,
    );
  }
  if (input.source && typeof input.source === "object") {
    const s = input.source as Json;
    set("source", {
      ...stored.source,
      name: "name" in s ? str(s.name, 120) : stored.source.name,
      url: "url" in s ? str(s.url, 1000) : stored.source.url,
      linkText: "linkText" in s ? str(s.linkText, 200) : stored.source.linkText,
    });
  }

  next.category = sectionById(sectionId).category;
  if (changed) next.writtenBy = "editor";
  return next;
}

export interface IssueEdit {
  title?: string;
  lead?: string;
  closing?: string;
  /** Full section layout: which items, in which order, in which section. */
  sections?: { id: string; items: Json[] }[];
  /** Required to change an issue that is already published. */
  confirmPublishedEdit?: boolean;
}

export async function saveIssue(id: string, edit: IssueEdit): Promise<NewsletterIssue> {
  const db = await readDb();
  const byId = byIdMap(db);

  const issue = await updateIssue(id, (stored) => {
    if (stored.status === "published" && !edit.confirmPublishedEdit) {
      throw new NewsletterError(
        "هذا العدد منشور. أكّد أنك تريد تعديله عمدًا، ثم أعد نشره.",
        409,
        { needsConfirmation: true },
      );
    }

    let sections = stored.sections;
    let unused = stored.unused;

    if (edit.sections) {
      const all = new Map(stored.sections.flatMap((s) => s.items.map((i) => [i.id, i])));
      const seen = new Set<string>();
      const layout = new Map<SectionId, NewsletterItem[]>();

      for (const incoming of edit.sections) {
        if (!isSectionId(incoming.id)) continue;
        const items: NewsletterItem[] = [];
        for (const raw of incoming.items ?? []) {
          const itemId = String(raw.id ?? "");
          const original = all.get(itemId);
          // Unknown or repeated ids are ignored: an edit can move and change
          // items, never invent one or publish the same item twice.
          if (!original || seen.has(itemId)) continue;
          seen.add(itemId);
          items.push(applyItemEdit(original, raw, incoming.id));
        }
        layout.set(incoming.id, items);
      }

      sections = stored.sections.map((s) => ({
        ...s,
        items: layout.get(s.id) ?? s.items.filter((i) => !seen.has(i.id)),
      }));

      // Anything the editor dropped goes back to the unused list, with a reason.
      const kept = new Set(sections.flatMap((s) => s.items.map((i) => i.id)));
      const removed = [...all.values()].filter((i) => !kept.has(i.id));
      unused = [
        ...stored.unused.filter(
          (u) => !sections.some((s) => s.items.some((i) => i.contributionId === u.contributionId)),
        ),
        ...removed.map((i) => {
          const c = byId.get(i.contributionId);
          return {
            contributionId: i.contributionId,
            title: c?.title ?? i.title,
            memberName: i.contributor.memberName,
            category: c ? effectiveCategory(c) : i.category,
            editorialScore: i.editorialScore,
            reason: "removed_by_editor" as const,
            detail: "أزاله المحرر من المسودة.",
          };
        }),
      ];
    }

    return validateIssue(
      {
        ...stored,
        title: edit.title !== undefined ? str(edit.title, 120) || stored.title : stored.title,
        lead: edit.lead !== undefined ? str(edit.lead, 400) : stored.lead,
        closing: edit.closing !== undefined ? str(edit.closing, 400) : stored.closing,
        sections,
        unused,
        editedAfterPublish: stored.status === "published" ? true : stored.editedAfterPublish,
      },
      byId,
    );
  });
  if (!issue) throw new NewsletterError("العدد غير موجود.", 404);
  return issue;
}

export async function removeDraft(id: string): Promise<void> {
  const ok = await deleteIssue(id, (issue) => {
    if (issue.status === "published") {
      throw new NewsletterError("لا يُحذف عدد منشور.", 409);
    }
  });
  if (!ok) throw new NewsletterError("العدد غير موجود.", 404);
}

// ---------------------------------------------------------------------------
// Preview, archive, publish
// ---------------------------------------------------------------------------

export async function getIssueWithContext(id: string) {
  const issue = await getIssue(id);
  if (!issue) throw new NewsletterError("العدد غير موجود.", 404);
  const db = await readDb();
  const used = new Set(issue.sections.flatMap((s) => s.items.map((i) => i.contributionId)));
  // Everything from the cycle that could be added, with traceability details.
  const candidates = db.contributions
    .filter((c) => !c.removed && c.cycleKey === issue.cycleKey && c.evaluation && !used.has(c.id))
    .map((c) => ({
      contributionId: c.id,
      title: c.title,
      memberName: c.memberName,
      category: effectiveCategory(c),
      editorialScore: editorialScore(c),
      status: c.adminOverride?.status ?? c.status,
      // Context only; never used to choose content.
      memberPoints: effectivePoints(c),
    }))
    .sort((a, b) => b.editorialScore - a.editorialScore);
  return {
    issue,
    candidates,
    openWarnings: openWarnings(issue),
    url: issueUrl(issue.number),
  };
}

/**
 * memberId -> current display name, resolved live and excluding anyone who
 * has switched off `showNameOnDiscoveries`. Read fresh on every
 * preview/publish call, never from the item's stored `contributor.memberName`.
 */
async function liveResearcherNames(): Promise<Record<string, string>> {
  const members = await listAllMembers();
  return Object.fromEntries(
    members
      .filter((m) => m.showNameOnDiscoveries !== false)
      .map((m) => [m.id, m.name]),
  );
}

export async function previewHtml(id: string): Promise<string> {
  const issue = await getIssue(id);
  if (!issue) throw new NewsletterError("العدد غير موجود.", 404);
  return renderIssueHtml(issue, {
    mode: "preview",
    researcherNames: await liveResearcherNames(),
  });
}

async function archiveEntries(extra?: NewsletterIssue): Promise<ArchiveEntry[]> {
  const stored = await listIssues();
  const published = stored.filter((n) => n.status === "published" || n.id === extra?.id);
  const entries: ArchiveEntry[] = LEGACY_ISSUES.map((l) => ({
    number: l.number,
    lead: l.lead,
    monthLabel: l.monthLabel,
    href: l.path,
  }));
  for (const n of published) {
    const issue = n.id === extra?.id ? extra : n;
    if (entries.some((e) => e.number === issue.number)) continue;
    entries.push({
      number: issue.number,
      lead: issue.lead,
      monthLabel: monthOf(issue.cycleEnd).label,
      href: `${issueSlug(issue.number)}/index.html`,
    });
  }
  return entries;
}

export interface PublishOptions {
  /** The editor has read the open warnings and accepts them. */
  acknowledgeWarnings?: boolean;
  /** Deliberately replace an issue this system published before. */
  republish?: boolean;
}

export async function publishIssue(
  id: string,
  options: PublishOptions,
): Promise<{ issue: NewsletterIssue; warnings: string[] }> {
  const issue = await getIssue(id);
  if (!issue) throw new NewsletterError("العدد غير موجود.", 404);

  const itemCount = issue.sections.reduce((n, s) => n + s.items.length, 0);
  if (itemCount === 0) {
    throw new NewsletterError("العدد فارغ، لا يُنشر عدد بلا محتوى.", 422);
  }
  const warnings = openWarnings(issue);
  if (warnings > 0 && !options.acknowledgeWarnings) {
    throw new NewsletterError(
      `في المسودة ${warnings} ملاحظة مراجعة مفتوحة. راجعها أو أكّد أنك اطّلعت عليها قبل النشر.`,
      409,
      { openWarnings: warnings },
    );
  }
  if (issue.status === "published" && !options.republish) {
    throw new NewsletterError(
      "هذا العدد منشور بالفعل. استخدم إعادة النشر إن كنت تريد استبداله عمدًا.",
      409,
    );
  }
  if (LEGACY_ISSUES.some((l) => l.number === issue.number)) {
    throw new NewsletterError("رقم هذا العدد محجوز لعدد منشور مسبقًا.", 409);
  }

  const publisher = resolvePublisher();
  const path = `${issueSlug(issue.number)}/index.html`;

  // Versioning (§23): a folder that exists is never replaced unless this
  // system published it and the editor explicitly asked to re-publish.
  const exists = await publisher.exists(path);
  if (exists && !(issue.publication && options.republish)) {
    throw new NewsletterError(
      `المسار ${path} موجود مسبقًا في ${publisher.describe()} ولن يُستبدل.`,
      409,
    );
  }

  // Render before writing anything, so a rendering failure publishes nothing.
  const html = renderIssueHtml(issue, {
    mode: "publish",
    researcherNames: await liveResearcherNames(),
  });
  const version = (issue.publication?.version ?? 0) + 1;
  const label = `newsletter: publish issue ${issueSlug(issue.number)}${version > 1 ? ` (v${version})` : ""}`;
  await publisher.write(path, html, label);

  const publication = {
    url: issueUrl(issue.number),
    at: new Date().toISOString(),
    target: publisher.target,
    path,
    version,
  };
  const saved = await updateIssue(id, (stored) => ({
    ...stored,
    status: "published",
    publication,
    editedAfterPublish: false,
  }));

  // The archive index is a list, not an issue: it is safe to rewrite.
  const notes: string[] = [];
  try {
    const archive = renderArchiveHtml(await archiveEntries(saved!));
    await publisher.write("index.html", archive, "newsletter: update archive");
  } catch (err) {
    notes.push(
      `نُشر العدد، لكن تعذّر تحديث صفحة الأرشيف: ${(err as Error)?.message ?? "خطأ غير معروف"}`,
    );
  }

  return { issue: saved!, warnings: notes };
}

export async function listIssueSummaries() {
  const issues = await listIssues();
  return {
    legacy: LEGACY_ISSUES,
    issues: issues.map((n) => ({
      id: n.id,
      number: n.number,
      cycleKey: n.cycleKey,
      cycleLabel: cycleLabel(n.cycleKey),
      status: n.status,
      items: n.sections.reduce((sum, s) => sum + s.items.length, 0),
      openWarnings: openWarnings(n),
      updatedAt: n.updatedAt,
      publication: n.publication,
      editedAfterPublish: n.editedAfterPublish,
      engine: n.generation.engine,
    })),
  };
}
