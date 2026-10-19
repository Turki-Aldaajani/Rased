import assert from "node:assert/strict";
import { test } from "node:test";
import type { Reviewer, ReviewerRole } from "@/lib/db/schema";
import { STALE_EDITOR, isStaleRevision } from "@/lib/newsletter/edit";
import { NewsletterError } from "@/lib/newsletter/errors";
import type { SectionId } from "@/lib/newsletter/sections";
import type { NewsletterIssue, NewsletterItem } from "@/lib/newsletter/types";
import { CURRENT, contribution } from "@/test/fixtures";
import {
  applyReviewerSave,
  applyStale,
  draftState,
  findReviewer,
  generateToken,
  hashToken,
  ITEM_GONE,
  reviewSections,
} from "./core";
import { reviewProgress } from "./roles";

const source = contribution({ id: "c-story", url: "https://example.com/story" });
const tool = contribution({ id: "c-tool", url: "https://example.com/tool" });
const lesson = contribution({ id: "c-learn", url: "https://example.com/learn" });
const db = { contributions: [source, tool, lesson] };

/** A field as the page sends it: the new value and the one it started from. */
const f = (value: string, base: string) => ({ value, base });

function item(id: string, contributionId: string, over: Partial<NewsletterItem> = {}): NewsletterItem {
  return {
    id,
    contributionId,
    title: "عنوان",
    headline: "",
    kicker: "",
    paragraphs: ["فقرة"],
    whyItMatters: "نص العضو كما كتبه",
    chip: "",
    fitLabel: "",
    fitText: "للجميع",
    ideaLabel: "",
    idea: "فكرة",
    exampleLabel: "",
    example: "",
    note: "",
    moral: "",
    platform: "",
    byline: "",
    levelLabel: "",
    difficulty: null,
    prerequisites: [],
    audience: [],
    ctaLabel: "",
    source: { name: "Example", url: `https://example.com/${contributionId.slice(2)}`, linkText: "", publishedAt: null },
    contributor: { memberId: "m1", memberName: "Reem" },
    category: "important_news",
    editorialScore: 70,
    writtenBy: "ai",
    aiNotes: [],
    flags: [],
    ...over,
  };
}

function issue(over: Partial<NewsletterIssue> = {}): NewsletterIssue {
  const section = (id: SectionId, items: NewsletterItem[]) => ({ id, title: id, items, error: null });
  return {
    id: "n1",
    number: 3,
    cycleKey: CURRENT,
    cycleStart: "",
    cycleEnd: "",
    status: "draft",
    title: "",
    lead: "",
    closing: "",
    sections: [
      section("models", []),
      section("new_tools", [item("i-tool", "c-tool")]),
      section("other_tools", []),
      section("top_news", [item("i-story", "c-story")]),
      section("learn", [item("i-learn", "c-learn", { note: "ملاحظة", fitText: "للمبتدئين" })]),
      section("social", []),
    ],
    unused: [],
    generation: { engine: "ai", model: null, at: "", errors: [] },
    createdAt: "",
    updatedAt: "",
    publication: null,
    editedAfterPublish: false,
    ...over,
  };
}

function reviewer(role: ReviewerRole, over: Partial<Reviewer> = {}): Reviewer {
  return {
    id: `r-${role}`,
    name: role === "insight" ? "أحمد" : role === "tools" ? "سارة" : "نورة",
    role,
    tokenHash: hashToken(`token-${role}`),
    active: true,
    createdAt: "",
    lastSeenAt: null,
    ...over,
  };
}

const find = (n: NewsletterIssue, id: string) =>
  n.sections.flatMap((s) => s.items).find((i) => i.id === id);

const refusal = (status: number) => (err: unknown) =>
  err instanceof NewsletterError && err.status === status;

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

test("a link token is long and random, and only its SHA-256 is kept", () => {
  const token = generateToken();
  assert.ok(Buffer.from(token, "base64url").length >= 32);
  assert.notEqual(generateToken(), token);
  const hash = hashToken(token);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.ok(!hash.includes(token));
  const r = reviewer("insight", { tokenHash: hash });
  assert.equal(findReviewer([r], token)?.id, r.id);
});

test("a renewed link voids the old one, and a stopped reviewer has no access", () => {
  const old = generateToken();
  const fresh = generateToken();
  const r = reviewer("tools", { tokenHash: hashToken(old) });
  const renewed = { ...r, tokenHash: hashToken(fresh) };
  assert.equal(findReviewer([renewed], old), null);
  assert.equal(findReviewer([renewed], fresh)?.id, r.id);
  assert.equal(findReviewer([{ ...renewed, active: false }], fresh), null);
  assert.equal(findReviewer([renewed], ""), null);
});

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

test("a field outside the reviewer's role is ignored, even when sent by hand", () => {
  const { issue: next, item: saved } = applyReviewerSave(issue(), db, reviewer("insight"), "i-story", {
    fields: {
      whyItMatters: f("نص أوضح", "نص العضو كما كتبه"),
      title: f("عنوان مختلف", "عنوان"),
      paragraphs: ["فقرة مكتوبة يدويًا"],
      "source.url": f("https://evil.example/", "https://example.com/story"),
      idea: f("لا", "فكرة"),
    },
  });
  assert.equal(saved.whyItMatters, "نص أوضح");
  assert.equal(saved.title, "عنوان");
  assert.deepEqual(saved.paragraphs, ["فقرة"]);
  assert.equal(saved.source.url, "https://example.com/story");
  assert.equal(saved.idea, "فكرة");
  assert.equal(saved.writtenBy, "editor");
  assert.deepEqual(
    saved.review?.edits.map((e) => [e.field, e.previous, e.value, e.name]),
    [["whyItMatters", "نص العضو كما كتبه", "نص أوضح", "أحمد"]],
  );
  assert.equal(find(next, "i-tool")?.review, undefined);
});

test("a reviewer cannot reach a card outside their sections", () => {
  assert.throws(
    () =>
      applyReviewerSave(issue(), db, reviewer("tools"), "i-story", {
        fields: { fitText: f("x", "للجميع") },
      }),
    refusal(409),
  );
  const { item: saved } = applyReviewerSave(issue(), db, reviewer("tools"), "i-tool", {
    fields: {
      fitText: f("للمطورين", "للجميع"),
      idea: f("فكرة أوضح", "فكرة"),
      whyItMatters: f("لا", "نص العضو كما كتبه"),
    },
  });
  assert.equal(saved.fitText, "للمطورين");
  assert.equal(saved.idea, "فكرة أوضح");
  assert.equal(saved.whyItMatters, "نص العضو كما كتبه");
});

test("a save with no change still marks the card as reviewed by that role", () => {
  const { item: saved } = applyReviewerSave(issue(), db, reviewer("insight"), "i-story", {
    fields: { whyItMatters: f("نص العضو كما كتبه", "نص العضو كما كتبه") },
  });
  assert.equal(saved.review?.by.insight?.name, "أحمد");
  assert.equal(saved.review?.edits.length, 0);
  assert.equal(saved.writtenBy, "ai");
});

test("the content checker changes the link, the host gets url_changed, and «حديث» is recorded", () => {
  const { item: saved } = applyReviewerSave(issue(), db, reviewer("content"), "i-story", {
    fields: {
      "source.url": f("https://other.example/news", "https://example.com/story"),
      whyItMatters: f("لا", "نص العضو كما كتبه"),
    },
    fresh: true,
  });
  assert.equal(saved.source.url, "https://other.example/news");
  assert.equal(saved.whyItMatters, "نص العضو كما كتبه");
  assert.equal(saved.review?.fresh?.name, "نورة");
  assert.ok(saved.flags.some((f) => f.code === "url_changed"));
});

test("«غير حديث» moves the card to unused as stale, and only the content checker may", () => {
  const next = applyStale(issue(), db, reviewer("content"), "i-story");
  assert.equal(find(next, "i-story"), undefined);
  const unused = next.unused.find((u) => u.contributionId === "c-story");
  assert.equal(unused?.reason, "stale");
  assert.match(unused?.detail ?? "", /نورة/);
  assert.throws(() => applyStale(issue(), db, reviewer("insight"), "i-story"), refusal(403));
});

test("nothing can be changed once the issue is published", () => {
  const published = issue({ status: "published" });
  assert.throws(
    () =>
      applyReviewerSave(published, db, reviewer("insight"), "i-story", {
        fields: { whyItMatters: f("x", "نص العضو كما كتبه") },
      }),
    refusal(409),
  );
  assert.throws(() => applyStale(published, db, reviewer("content"), "i-story"), refusal(409));
});

// ---------------------------------------------------------------------------
// What each side sees
// ---------------------------------------------------------------------------

test("each role sees its own sections only, without the host's trail or the member's id", () => {
  const ids = (role: ReviewerRole) => reviewSections(issue(), reviewer(role)).map((s) => s.id);
  assert.deepEqual(ids("insight"), ["models", "top_news", "learn", "social"]);
  assert.deepEqual(ids("tools"), ["new_tools", "other_tools"]);
  assert.equal(ids("content").length, 6);

  const reviewed = applyReviewerSave(issue(), db, reviewer("insight"), "i-story", {
    fields: { whyItMatters: f("نص أوضح", "نص العضو كما كتبه") },
  }).issue;
  const card = reviewSections(reviewed, reviewer("insight"))
    .flatMap((s) => s.cards)
    .find((c) => c.item.id === "i-story")!;
  assert.deepEqual(card.editable, ["whyItMatters"]);
  assert.ok(!("review" in card.item));
  assert.ok(!("contributor" in card.item));
});

test("the host's summary counts each role's reviewed cards", () => {
  const reviewed = applyReviewerSave(issue(), db, reviewer("tools"), "i-tool", { fields: {} }).issue;
  const byRole = Object.fromEntries(reviewProgress(reviewed).map((p) => [p.role, p]));
  assert.deepEqual([byRole.tools.reviewed, byRole.tools.total], [1, 1]);
  assert.deepEqual([byRole.insight.reviewed, byRole.insight.total], [0, 2]);
  assert.deepEqual([byRole.content.reviewed, byRole.content.total], [0, 3]);
});

test("the page reviews the newest draft, and says so when the issue has gone out", () => {
  assert.equal(draftState([]).kind, "none");
  const older = issue({ id: "a", number: 2, status: "published" });
  const draft = issue({ id: "b", number: 3 });
  const state = draftState([older, draft]);
  assert.ok(state.kind === "draft" && state.issue.id === "b");
  assert.deepEqual(draftState([older, { ...draft, status: "published" }]), {
    kind: "published",
    number: 3,
  });
});

// ---------------------------------------------------------------------------
// Saving at the same time
// ---------------------------------------------------------------------------

test("two roles saving the same card from the same opened page both keep their change, in either order", () => {
  const insightSave = { fields: { whyItMatters: f("نص أوضح", "نص العضو كما كتبه") } };
  const contentSave = {
    fields: { "source.url": f("https://example.com/story?ref=1", "https://example.com/story") },
  };
  const orders: [ReviewerRole, typeof insightSave | typeof contentSave][][] = [
    [["insight", insightSave], ["content", contentSave]],
    [["content", contentSave], ["insight", insightSave]],
  ];
  for (const steps of orders) {
    let stored = issue();
    for (const [role, input] of steps) {
      const out = applyReviewerSave(stored, db, reviewer(role), "i-story", input);
      assert.deepEqual(out.conflicts, []);
      stored = out.issue;
    }
    const card = find(stored, "i-story")!;
    assert.equal(card.whyItMatters, "نص أوضح");
    assert.equal(card.source.url, "https://example.com/story?ref=1");
    assert.ok(card.review?.by.insight && card.review?.by.content);
  }
});

test("a field changed since the page opened is refused with who changed it, and the rest of the save goes through", () => {
  const first = reviewer("insight");
  const second = reviewer("insight", { id: "r-insight-2", name: "خالد" });
  // Both opened the learn card with the note "ملاحظة"; أحمد saves first.
  const afterFirst = applyReviewerSave(issue(), db, first, "i-learn", {
    fields: { note: f("ملاحظة أوضح", "ملاحظة") },
  }).issue;
  const out = applyReviewerSave(afterFirst, db, second, "i-learn", {
    fields: { note: f("ملاحظة أخرى", "ملاحظة"), fitText: f("للجميع", "للمبتدئين") },
  });
  assert.equal(out.conflicts.length, 1);
  assert.equal(out.conflicts[0].field, "note");
  assert.equal(out.conflicts[0].current, "ملاحظة أوضح");
  assert.match(out.conflicts[0].message, /أحمد/);
  assert.equal(out.item.note, "ملاحظة أوضح");
  assert.equal(out.item.fitText, "للجميع");
  // Not counted as خالد's review until the conflict is settled.
  assert.equal(out.item.review?.by.insight?.name, "أحمد");

  // Keeping their own text: the next save starts from the value now stored.
  const settled = applyReviewerSave(out.issue, db, second, "i-learn", {
    fields: { note: f("ملاحظة أخرى", "ملاحظة أوضح") },
  });
  assert.deepEqual(settled.conflicts, []);
  assert.equal(settled.item.note, "ملاحظة أخرى");
  assert.equal(settled.item.review?.by.insight?.name, "خالد");
});

test("a field the host changed is refused in the host's name", () => {
  const hostEdited = issue();
  find(hostEdited, "i-story")!.whyItMatters = "نص المحرر";
  const out = applyReviewerSave(hostEdited, db, reviewer("insight"), "i-story", {
    fields: { whyItMatters: f("نص أوضح", "نص العضو كما كتبه") },
  });
  assert.equal(out.conflicts[0]?.message, "عدّل المحرر هذا الحقل قبل قليل.");
  assert.equal(out.item.whyItMatters, "نص المحرر");
});

test("a save on a card taken out of the draft meanwhile is refused, and the card stays out", () => {
  const afterStale = applyStale(issue(), db, reviewer("content"), "i-story");
  assert.throws(
    () =>
      applyReviewerSave(afterStale, db, reviewer("insight"), "i-story", {
        fields: { whyItMatters: f("نص أوضح", "نص العضو كما كتبه") },
      }),
    (err: unknown) => err instanceof NewsletterError && err.status === 409 && err.message === ITEM_GONE,
  );
  assert.equal(find(afterStale, "i-story"), undefined);
});

test("the host's save from an older revision is refused, so reviewers' edits stay", () => {
  // The host opens revision 4; a reviewer saves, and the store moves it to 5.
  const opened = issue({ revision: 4 });
  const afterReviewer = {
    ...applyReviewerSave(opened, db, reviewer("insight"), "i-story", {
      fields: { whyItMatters: f("نص أوضح", "نص العضو كما كتبه") },
    }).issue,
    revision: 5,
  };
  assert.equal(isStaleRevision(afterReviewer, opened.revision), true);
  assert.equal(isStaleRevision(afterReviewer, 5), false);
  assert.match(STALE_EDITOR, /حدّث الصفحة/);
  // Issues from before revisions existed read as 0; an editor that sends none is not checked.
  assert.equal(isStaleRevision(issue(), 0), false);
  assert.equal(isStaleRevision(afterReviewer, undefined), false);
});
