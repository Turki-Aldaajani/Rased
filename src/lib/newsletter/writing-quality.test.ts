import assert from "node:assert/strict";
import { test } from "node:test";
import type { Contribution } from "@/lib/db/schema";
import { contribution } from "@/test/fixtures";
import { composeFromSource, distinctTexts } from "./compose";
import { coerceWritten, merge, type WrittenItem } from "./generate";
import type { SectionKind } from "./sections";
import type { NewsletterItem } from "./types";
import { insightFlags } from "./validate";

/**
 * Issue #39: the Gemini 4 Carbon card said one thing three times and its
 * «لماذا يهمك؟» repeated the body as a list of numbers. Issue 3's good
 * cards are the reference for what must stay clean.
 */

const CARBON_SUMMARY =
  "أعلنت Google DeepMind عن Gemini 4 Carbon، وهو نموذج حدودي جديد وصفته بأقوى نماذجها في الأمن السيبراني والمهام طويلة الأفق. تصدّر النموذج مؤشر Artificial Analysis Intelligence Index v5.0 بنتيجة 59.";
const CARBON_POINTS = [
  "أعلنت Google عن Gemini 4 Carbon كنموذجها الحدودي الأقوى مع قدرات متقدمة في الأمن السيبراني والمهام طويلة الأفق.",
  "حلّ النموذج أولًا في مؤشر Artificial Analysis Intelligence Index v5.0 بنتيجة 59.",
];
const CARBON_CAPABILITIES = [
  "يتصدر Gemini 4 Carbon مؤشر Artificial Analysis Intelligence Index v5.0 بنتيجة 59.",
  "يستطيع النموذج استغلال أكثر من نصف الثغرات في اختبارات الأمن.",
];
const CARBON_WHY =
  "في 26 أكتوبر 2026 أعلنت Google عن Gemini 4 Carbon الذي تصدّر مؤشر Artificial Analysis Intelligence Index v5.0 بنتيجة 59، وحقق 88.2% في اختبار و54.8% في آخر و71% في ثالث، وElo 1768، و80% في اختبار رابع، وهي أرقام تضعه في مقدمة النماذج الحدودية الحالية في الأمن السيبراني والمهام طويلة الأفق. حين يصبح النموذج قادرًا على استغلال الثغرات بنسبة تتجاوز 50%، يصبح من يحصل عليه أولًا قرارًا أمنيًا لا تسويقيًا.";

function evaluated(over: {
  aiSummary?: string;
  keyPoints?: string[];
  capabilities?: string[];
  memberReason?: string;
}): Contribution {
  return contribution({
    memberReason: over.memberReason ?? "",
    evaluation: {
      aiSummary: over.aiSummary ?? "",
      aiInterpretation: "",
      editorial: { score: 50 },
      classification: { reason: "" },
      audience: { tags: [], reason: "" },
      difficulty: { level: "not_applicable", prerequisites: [] },
      verification: { status: "verified", originalDate: null, evidence: [], resolvedSource: null },
      extracted: {
        title: "",
        entity: "Google DeepMind",
        source: "",
        practicalValue: "",
        keyPoints: over.keyPoints ?? [],
        capabilities: over.capabilities ?? [],
        links: [],
        sourceUrl: null,
      },
    } as unknown as Contribution["evaluation"],
  });
}

function card(over: Partial<NewsletterItem>): NewsletterItem {
  return { paragraphs: [], whyItMatters: "", moral: "", ...over } as NewsletterItem;
}

const codes = (item: NewsletterItem, kind: SectionKind = "story") =>
  insightFlags(item, kind).map((f) => f.code);

// ---- distinctTexts / composeFromSource -----------------------------------

test("distinctTexts drops a reworded sentence, not only a copy", () => {
  assert.deepEqual(distinctTexts([CARBON_SUMMARY, ...CARBON_POINTS], 3), [CARBON_SUMMARY]);
});

test("distinctTexts keeps sentences that say different things, up to the limit", () => {
  const list = ["النموذج متاح الآن في Gemini API للمطورين.", "ويدعم نافذة سياق أطول من الإصدار السابق بكثير.", "ثالث"];
  assert.deepEqual(distinctTexts(list, 2), list.slice(0, 2));
  assert.deepEqual(distinctTexts(["", null, undefined, " نص "], 3), ["نص"]);
});

test("a model card built from source has the summary and one new capability, at most", () => {
  const c = evaluated({ aiSummary: CARBON_SUMMARY, keyPoints: CARBON_POINTS, capabilities: CARBON_CAPABILITIES });
  const item = composeFromSource(c, "models");
  assert.deepEqual(item.paragraphs, [CARBON_SUMMARY, CARBON_CAPABILITIES[1]]);
});

test("without a summary, key points still give a source-built story a body", () => {
  const c = evaluated({ keyPoints: ["النقطة الأولى عن النموذج الجديد ومزاياه.", "النقطة الثانية عن توفره للمطورين اليوم."] });
  assert.equal(composeFromSource(c, "top_news").paragraphs.length, 2);
});

test("the source-built item keeps the member's text, verbatim, in both fields", () => {
  const item = composeFromSource(evaluated({ memberReason: CARBON_WHY }), "models");
  assert.equal(item.whyItMatters, CARBON_WHY);
  assert.equal(item.memberReason, CARBON_WHY);
});

// ---- the four new checks --------------------------------------------------

test("paragraphs_repeat: the Carbon body is flagged", () => {
  assert.ok(codes(card({ paragraphs: [CARBON_SUMMARY, ...CARBON_POINTS] })).includes("paragraphs_repeat"));
});

test("why_repeats_body, why_too_long and why_number_list: the Carbon «لماذا يهمك؟» trips all three", () => {
  const got = codes(card({ paragraphs: [CARBON_SUMMARY], whyItMatters: CARBON_WHY }));
  for (const code of ["why_repeats_body", "why_too_long", "why_number_list"]) {
    assert.ok(got.includes(code), `${code} missing from ${got.join(", ")}`);
  }
  const severity = insightFlags(card({ paragraphs: [CARBON_SUMMARY], whyItMatters: CARBON_WHY }), "story")
    .find((f) => f.code === "why_number_list")?.severity;
  assert.equal(severity, "info");
});

test("why_repeats_body also fires on three numbers shared with the body", () => {
  const body = "النموذج حقق 88 في الاختبار الأول و54 في الثاني و71 في الثالث.";
  assert.ok(codes(card({ paragraphs: [body], whyItMatters: "تذكّر الأرقام 88 و54 و71 جيدًا." })).includes("why_repeats_body"));
});

test("the condensed Carbon line from the issue passes clean", () => {
  const why =
    "حين يستطيع نموذج استغلال أكثر من نصف الثغرات المختبرة، يصبح تحديد من يحصل عليه أولًا قرارًا أمنيًا لا تسويقيًا، ولهذا يقتصر حاليًا على فرق الأمن المعتمدة.";
  assert.deepEqual(codes(card({ paragraphs: [CARBON_SUMMARY], whyItMatters: why })), []);
});

test("why_too_long: «المغزى» is held to 55 words in the social section", () => {
  const long = Array.from({ length: 56 }, (_, i) => `كلمة${i}`).join(" ");
  assert.ok(codes(card({ moral: long }), "social").includes("why_too_long"));
  assert.deepEqual(codes(card({ moral: "درس قصير." }), "social"), []);
});

test("«لماذا يهمك؟» checks only apply where it is printed", () => {
  assert.deepEqual(codes(card({ paragraphs: [CARBON_SUMMARY], whyItMatters: CARBON_WHY }), "tool"), []);
});

test("why_new_number: a number in the condensed line that the member never wrote", () => {
  const item = card({
    whyItMatters: "يستغل النموذج 60% من الثغرات.",
    memberReason: "يستغل النموذج أكثر من نصف الثغرات.",
  });
  assert.ok(codes(item).includes("why_new_number"));
  assert.ok(!codes({ ...item, whyItMatters: item.memberReason! }).includes("why_new_number"));
});

// Issue 3, as published. None of these should be flagged.
const ISSUE_3: { name: string; kind: SectionKind; item: NewsletterItem }[] = [
  {
    name: "Claude Haiku 5.5",
    kind: "story",
    item: card({
      paragraphs: [
        "أطلقت Anthropic نموذج Claude Haiku 5.5 بوصفه أصغر نموذج وأسرعه وأقلّه تكلفة، موجّهًا للمهام عالية الحجم مثل التلخيص والتصنيف والاستعلامات والعمل كنموذج فرعي في البرمجة. وتقول الشركة إن تكلفة تشغيله أقل بنحو 75% من Haiku 4.5، مع خفض أسعار قراءات الذاكرة المؤقتة لـ Sonnet 5.5 وإتاحة رصيد API شهري لمشتركي Max وTeam.",
      ],
      whyItMatters:
        "لو شغلك مهام متكررة وكثيرة مثل التلخيص والتصنيف، هذا النموذج يخفّض تكلفتها بشكل ملحوظ بدون ما تدفع ثمن نموذج أكبر. جرّب على شغلك الخفيف، وخلي النماذج الأقوى للمهام الأصعب.",
    }),
  },
  {
    name: "EmbeddingGemma 2",
    kind: "story",
    item: card({
      paragraphs: [
        "أعلنت Google عبر حساب Google Gemma الرسمي عن إصدار EmbeddingGemma 2، وهو نموذج تضمين متعدد الوسائط خفيف الوزن يوحّد النصوص والأكواد والصور والفيديو والصوت في فضاء تضمين واحد. يبلغ حجمه 740 مليون معامل، ويدعم أبعادًا مرنة بين 768 و128 عبر MRL ونافذة سياق 8K، ويُوزَّع برخصة Apache 2.0 مع تحسين لحالات الاستخدام على الجهاز.",
      ],
      whyItMatters:
        "لو تشتغل على تطبيق فيه أكثر من نوع محتوى (نص وصور وصوت)، تقدر تستخدم نموذج واحد لكلها بدل نموذج لكل نوع. وحجمه الخفيف مع رخصة Apache 2.0 المفتوحة يخليك تشغّله على جهازك مباشرة، ويناسب البحث المتقدم وتصنيف البيانات.",
    }),
  },
  {
    name: "Gemini 4 Argon",
    kind: "story",
    item: card({
      paragraphs: [
        "أعلن Sundar Pichai عبر منصة X إطلاق نموذج Gemini 4 Argon وتوفّره عالميًا للمطورين والمؤسسات في الطبقة المدفوعة من Gemini API ومنصة Gemini، ولمشتركي Ultra في Google Antigravity، ولمشتركي Ultra وPro في تطبيق Gemini وSearch. وأحال إلى منشور على مدونة Google يتضمن تفاصيل التوفّر والأسعار والعروض التوضيحية.",
      ],
      whyItMatters:
        "صُمم النموذج خصيصًا لحل التحديات البرمجية المعقدة، والتحليلات التخصصية في قطاعات المال والقانون والأمن السيبراني، متصدرًا مؤشرات قياس الأداء العالمية مقارنة بنماذج الذكاء الاصطناعي المنافسة.",
    }),
  },
  {
    name: "Reka Rho-1",
    kind: "story",
    item: card({
      paragraphs: [
        "أطلقت Reka نسخة معاينة بحثية من Rho-1، وهو نموذج استدلال شامل بحجم 19 مليار معامل، دُرّب من الصفر. تفهم شبكة عصبية واحدة النصوص والصور والفيديو وتولّدها وتستدل عليها، وتُخرج أيضًا أوامر حركة للروبوتات. وتطرحه Reka بديلًا لخطوط العمل التي تمرّر المهام بين نماذج متخصصة، إذ يضيف كل تسليم تأخيرًا ويجعل كل نموذج يرى جزءًا ضيقًا من المهمة.",
        "وفي جلسة عرضتها Reka، رسم النموذج منارة وحدّدها بإطار وحرّكها، ثم حوّل الفيديو إلى عاصفة ثلجية وشرح الفرق، في 5 جولات دون أداة أو نموذج ثانٍ.",
      ],
      whyItMatters:
        "Reka تطلق Rho-1، نموذج واحد يعالج ويصنع النصوص، الفديوهات، والصور بدلا من ربط نموذج للنص وآخر للصور وثالث للروبوت وضياع الفهم بينها.",
    }),
  },
  {
    name: "Reddit / بدائل Adobe",
    kind: "social",
    item: card({
      paragraphs: [
        "نشر أحد المطورين على مجتمع r/OpenAI تجريته في استغلال وكلاء الذكاء الاصطناعي (AI Agents) لبناء بدائل مفتوحة المصدر بلغة Rust لسبعة من أبرز تطبيقات Adobe، من بينها Photoshop وPremiere وAfter Effects.",
        "وأوضح المطور أن الأكواد المصدرية وروابط التجربة متوفرة في التعليقات. وعلى الرغم من طموح الفكرة، إلا أن تقييم مدى كفاءة وجاهزية هذه البدائل يظل مرهونًا بالتجربة العملية المباشرة.",
      ],
      moral:
        "الذكاء الاصطناعي خفّض تكلفة البداية، لكنه لم يخفّض تكلفة الإتقان. أي ادعاء بأن أداة جديدة تعوّض برنامجًا راسخًا لا يُحكم عليه من عرض مرئي، بل بتجربته على مهمة حقيقية من عملك. وللمطورين، الدرس أن بناء النموذج الأولي أصبح سريعًا، فالميزة صارت في جودة التنفيذ والتفاصيل.",
    }),
  },
];

for (const { name, kind, item } of ISSUE_3) {
  test(`issue 3's ${name} card raises none of the new flags`, () => {
    // Reka's line opens by restating the headline, so only its body is held clean.
    const got = codes(item, kind);
    assert.deepEqual(name === "Reka Rho-1" ? got.filter((c) => c !== "why_repeats_body") : got, []);
  });
}

// ---- merge / coerceWritten ------------------------------------------------

function written(over: Partial<WrittenItem>): WrittenItem {
  return {
    ref: "c1",
    title: "",
    headline: "",
    paragraphs: [],
    why: "",
    chip: "",
    fitText: "",
    idea: "",
    example: "",
    note: "",
    moral: "",
    platform: "",
    byline: "",
    needsReview: [],
    ...over,
  };
}

test("merge: an empty why falls back to the member's text", () => {
  const c = evaluated({ memberReason: CARBON_WHY });
  const item = merge(composeFromSource(c, "models"), written({ why: "  " }), c);
  assert.equal(item.whyItMatters, CARBON_WHY);
  assert.equal(item.memberReason, CARBON_WHY);
});

test("merge: a condensed why is used, and the member's text is kept beside it", () => {
  const c = evaluated({ memberReason: CARBON_WHY });
  const item = merge(composeFromSource(c, "models"), written({ why: "قرار أمني لا تسويقي — لمن يحصل عليه أولًا." }), c);
  assert.equal(item.whyItMatters, "قرار أمني لا تسويقي، لمن يحصل عليه أولًا.");
  assert.equal(item.memberReason, CARBON_WHY);
});

test("coerceWritten: missing fields read as empty, unknown and repeated refs are dropped", () => {
  const out = coerceWritten(
    {
      items: [
        { ref: "c1", title: "عنوان", paragraphs: ["فقرة", 3, null] },
        { ref: "c1", title: "مكرر" },
        { ref: "ghost", title: "لم يُطلب" },
        "not an object",
      ],
    },
    ["c1", "c2"],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].title, "عنوان");
  assert.deepEqual(out[0].paragraphs, ["فقرة", "3"]);
  assert.equal(out[0].why, "");
  assert.deepEqual(out[0].needsReview, []);
});

test("coerceWritten: an answer without an items list is an error", () => {
  assert.throws(() => coerceWritten({}, ["c1"]));
  assert.throws(() => coerceWritten(null, ["c1"]));
});

// ---- provider ---------------------------------------------------------------

test("with AI_PROVIDER=deepseek and no Anthropic key, the section is written by DeepSeek", async () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  process.env.AI_PROVIDER = "deepseek";
  process.env.DEEPSEEK_API_KEY = "test-key";
  delete process.env.ANTHROPIC_API_KEY;

  const c = evaluated({ aiSummary: CARBON_SUMMARY, memberReason: CARBON_WHY });
  let sent: { model?: string; response_format?: unknown } = {};
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    sent = JSON.parse(init?.body ?? "{}");
    const answer = { items: [{ ref: c.id, title: "Gemini 4 Carbon", paragraphs: [CARBON_SUMMARY], why: "قرار أمني لا تسويقي." }] };
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: "stop" }] }),
      { status: 200 },
    );
  }) as typeof fetch;

  try {
    const { newsletterAiEnabled, newsletterModel, writeSection } = await import("./generate");
    assert.equal(newsletterAiEnabled(), true);
    assert.match(newsletterModel(), /^deepseek-/);

    const out = await writeSection("models", [c]);
    assert.equal(out.engine, "ai");
    assert.equal(out.error, null);
    assert.match(sent.model ?? "", /^deepseek-/);
    assert.deepEqual(sent.response_format, { type: "json_object" });
    assert.equal(out.items[0].whyItMatters, "قرار أمني لا تسويقي.");
    assert.equal(out.items[0].memberReason, CARBON_WHY);
  } finally {
    globalThis.fetch = realFetch;
    process.env = saved;
  }
});
