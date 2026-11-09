import assert from "node:assert/strict";
import { test } from "node:test";
import { contentWords, normaliseArabic, restatement, textOverlap, textSimilarity, wordCount } from "./text";

// The Gemini 4 Carbon card from issue #39: three paragraphs, one fact.
const CARBON_1 =
  "أعلنت Google DeepMind عن Gemini 4 Carbon، وهو نموذج حدودي جديد وصفته بأقوى نماذجها في الأمن السيبراني والمهام طويلة الأفق. تصدّر النموذج مؤشر Artificial Analysis Intelligence Index v5.0 بنتيجة 59.";
const CARBON_2 =
  "أعلنت Google عن Gemini 4 Carbon كنموذجها الحدودي الأقوى مع قدرات متقدمة في الأمن السيبراني والمهام طويلة الأفق.";
const CARBON_3 = "حلّ النموذج أولًا في مؤشر Artificial Analysis Intelligence Index v5.0 بنتيجة 59.";

// Issue 3's Reka card: two paragraphs about one model that say different things.
const REKA_1 =
  "أطلقت Reka نسخة معاينة بحثية من Rho-1، وهو نموذج استدلال شامل بحجم 19 مليار معامل، دُرّب من الصفر. تفهم شبكة عصبية واحدة النصوص والصور والفيديو وتولّدها وتستدل عليها، وتُخرج أيضًا أوامر حركة للروبوتات.";
const REKA_2 =
  "وفي جلسة عرضتها Reka، رسم النموذج منارة وحدّدها بإطار وحرّكها، ثم حوّل الفيديو إلى عاصفة ثلجية وشرح الفرق، في 5 جولات دون أداة أو نموذج ثانٍ.";

test("diacritics, hamza forms, ta marbuta and alef maqsura read as one spelling", () => {
  assert.equal(normaliseArabic("أُعلِنَت"), normaliseArabic("اعلنت"));
  assert.equal(normaliseArabic("مدرسة"), normaliseArabic("مدرسه"));
  assert.equal(normaliseArabic("الأقوى"), normaliseArabic("الاقوي"));
  assert.equal(normaliseArabic("٥٩"), "59");
});

test("articles and joining words do not count as content", () => {
  assert.deepEqual(contentWords("في الأمن والتعديل"), ["امن", "تعديل"]);
  assert.equal(wordCount("في الأمن السيبراني"), 3);
});

test("identical texts are fully similar, unrelated ones not at all", () => {
  assert.equal(textSimilarity(CARBON_2, CARBON_2), 1);
  assert.equal(textSimilarity(CARBON_2, CARBON_3), 0);
  assert.equal(textSimilarity("", CARBON_2), 0);
});

test("a reworded paragraph is caught as a restatement", () => {
  assert.ok(restatement(CARBON_1, CARBON_2) >= 0.5);
  assert.ok(restatement(CARBON_1, CARBON_3) >= 0.5);
  // Order does not matter.
  assert.equal(restatement(CARBON_2, CARBON_1), restatement(CARBON_1, CARBON_2));
});

test("two paragraphs on one subject that add different facts are not", () => {
  assert.ok(restatement(REKA_1, REKA_2) < 0.5);
});

test("a very short sentence is not called a restatement for sharing a word or two", () => {
  assert.ok(restatement(CARBON_1, "نموذج Google") < 0.5);
});

test("overlap measures how much of the part the whole already has", () => {
  assert.equal(textOverlap(CARBON_3, CARBON_3 + " " + CARBON_2), 1);
  assert.equal(textOverlap("", CARBON_1), 0);
  assert.ok(textOverlap(CARBON_2, CARBON_1) > 0.7);
});
