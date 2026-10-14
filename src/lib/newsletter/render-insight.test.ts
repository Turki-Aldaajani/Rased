import assert from "node:assert/strict";
import { test } from "node:test";
import { renderIssueHtml } from "./render";
import { SECTION_IDS } from "./sections";
import type { NewsletterIssue, NewsletterItem, SectionId } from "./types";

const INSIGHT = "ما وراء الخبر بزاوية رصد";

function item(over: Partial<NewsletterItem> = {}): NewsletterItem {
  return {
    id: "i",
    contributionId: "c",
    title: "عنوان",
    headline: "",
    kicker: "",
    paragraphs: ["نص الخبر."],
    whyItMatters: "",
    chip: "",
    fitLabel: "",
    fitText: "",
    ideaLabel: "",
    idea: "",
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
    source: { name: "المصدر", url: "https://example.com", linkText: "" },
    contributor: { memberId: "m", memberName: "عضو" },
    category: "news",
    editorialScore: 0,
    ...over,
  } as NewsletterItem;
}

function issueWith(id: SectionId, items: NewsletterItem[]): NewsletterIssue {
  return {
    number: 2,
    title: "نشرة",
    lead: "l",
    closing: "c",
    cycleEnd: "2026-09-27",
    sections: SECTION_IDS.map((s) => ({
      id: s,
      title: "",
      items: s === id ? items : [],
      error: null,
    })),
  } as unknown as NewsletterIssue;
}

function cards(html: string): string {
  return html.slice(html.indexOf("<main"));
}

function count(html: string, needle: string): number {
  return cards(html).split(needle).length - 1;
}

test("each section's analysis sits under the shared heading, once per card", () => {
  const cases: [SectionId, Partial<NewsletterItem>, string[]][] = [
    ["models", { whyItMatters: "سبب" }, ["لماذا يهمك؟", "سبب"]],
    ["top_news", { whyItMatters: "سبب" }, ["لماذا يهمك؟", "سبب"]],
    ["new_tools", { fitText: "للمطورين", idea: "فكرة" }, ["مناسب لـ", "الفكرة", "فكرة"]],
    ["other_tools", { fitText: "للمطورين", idea: "فكرة" }, ["مناسب لـ", "الفكرة", "فكرة"]],
    ["learn", { note: "خلاصة", fitText: "للمبتدئين" }, ["خلاصة", "للمبتدئين"]],
    ["social", { moral: "المغزى: الدرس" }, ["المغزى", "الدرس"]],
  ];
  for (const [id, over, expected] of cases) {
    const html = renderIssueHtml(issueWith(id, [item(over)]), { mode: "publish" });
    assert.equal(count(html, INSIGHT), 1, id);
    const block = cards(html).slice(cards(html).indexOf(INSIGHT));
    for (const text of expected) assert.ok(block.includes(text), `${id}: ${text}`);
  }
});

test("the shared heading comes before the section's own sub-heading", () => {
  const html = renderIssueHtml(issueWith("top_news", [item({ whyItMatters: "سبب" })]), {
    mode: "publish",
  });
  const main = cards(html);
  assert.ok(main.indexOf(INSIGHT) < main.indexOf("لماذا يهمك؟"));
});

test("cards with no analysis show no frame", () => {
  for (const id of SECTION_IDS) {
    const html = renderIssueHtml(issueWith(id, [item()]), { mode: "publish" });
    assert.equal(count(html, INSIGHT), 0, id);
    assert.equal(count(html, 'class="why insight"'), 0, id);
  }
});

test("both tool sections label the audience «مناسب لـ»", () => {
  for (const id of ["new_tools", "other_tools"] as const) {
    const html = renderIssueHtml(issueWith(id, [item({ fitText: "للجميع" })]), {
      mode: "publish",
    });
    assert.ok(cards(html).includes('<span class="fit-label">مناسب لـ</span>'), id);
    assert.ok(!cards(html).includes("مفيد لـ"), id);
  }
});

test("before-you-start, examples and actions stay outside the frame", () => {
  const html = renderIssueHtml(
    issueWith("learn", [
      item({ note: "خلاصة", prerequisites: ["حساب"], example: "مثال", ctaLabel: "افتح" }),
    ]),
    { mode: "publish" },
  );
  const main = cards(html);
  const start = main.indexOf('class="why insight"');
  const end = main.indexOf("</div>", start);
  const frame = main.slice(start, end);
  for (const outside of ["قبل أن تبدأ", "مثال", "افتح"]) {
    assert.ok(!frame.includes(outside), outside);
  }
});
