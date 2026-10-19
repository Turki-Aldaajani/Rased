import assert from "node:assert/strict";
import { test } from "node:test";
import { HINT_MESSAGES, hintCounter, insightLengthHint, savedWarning, wordCount } from "./hint";

/** Twenty-two words of news about a model release. */
const NEWS =
  "أعلنت الشركة نموذجها الجديد للبرمجة، ويقول فريقها إنه يكتب الاختبارات ويصلح الأخطاء ويشرح التغييرات للمطورين خطوة بخطوة داخل المحرر نفسه دون انتظار.";

/** Words that appear nowhere in NEWS. */
const fresh = (n: number) =>
  ["قارن", "ذلك", "بسعر", "اشتراكك", "الحالي", "قبل", "تجربة", "مشروع", "صغير", "اليوم", "واحكم", "بنفسك"]
    .concat(Array.from({ length: 40 }, (_, i) => `كلمة${i}`))
    .slice(0, n)
    .join(" ");

test("the news is counted in words, Arabic and Latin alike", () => {
  assert.equal(wordCount(NEWS), 22);
  assert.equal(wordCount("Google Labs تطلق Playground"), 4);
  assert.equal(wordCount("   "), 0);
});

test("an empty field shows nothing", () => {
  assert.equal(insightLengthHint("", NEWS, "whyItMatters"), null);
  assert.equal(insightLengthHint("  \n ", NEWS, "idea"), null);
});

test("under half the news: the counter only", () => {
  const hint = insightLengthHint(fresh(6), NEWS, "whyItMatters")!;
  assert.equal(hint.state, "ok");
  assert.equal(hint.message, null);
  assert.equal(hintCounter(hint), "6 كلمة · الخبر 22 كلمة");
});

test("from half the news up to its length: longer than preferred", () => {
  for (const n of [11, 21]) {
    const hint = insightLengthHint(fresh(n), NEWS, "moral")!;
    assert.equal(hint.state, "long", `${n} words`);
    assert.equal(hint.message, HINT_MESSAGES.long);
  }
});

test("as long as the news or longer: longer than the news itself", () => {
  for (const n of [22, 30]) {
    const hint = insightLengthHint(fresh(n), NEWS, "note")!;
    assert.equal(hint.state, "longer", `${n} words`);
    assert.equal(hint.message, HINT_MESSAGES.longer);
  }
});

test("mostly the news' own words: a restatement, even when short", () => {
  const hint = insightLengthHint(
    "النموذج الجديد يكتب الاختبارات ويصلح الأخطاء للمطورين.",
    NEWS,
    "whyItMatters",
  )!;
  assert.ok(hint.overlap! > 0.7, String(hint.overlap));
  assert.equal(hint.state, "repeats");
  assert.equal(hint.message, HINT_MESSAGES.repeats);
});

test("«مناسب لـ» is measured by length only, never as a repeat", () => {
  const hint = insightLengthHint("للمطورين الذين يكتبون الاختبارات", NEWS, "fitText")!;
  assert.equal(hint.overlap, null);
  assert.equal(hint.state, "ok");
});

test("a line too short to judge is not called a repeat", () => {
  const hint = insightLengthHint("للمطورين", NEWS, "idea")!;
  assert.equal(hint.overlap, null);
  assert.equal(hint.state, "ok");
});

test("joining words do not count toward a repeat", () => {
  // Only the joining words are shared with the news; the content is new.
  const hint = insightLengthHint("في هذا من على قارن السعر بالبديل المجاني", NEWS, "idea")!;
  assert.ok(hint.overlap! <= 0.7, String(hint.overlap));
  assert.equal(hint.state, "ok");
});

test("the Playground card: «الفكرة» retelling the news is flagged as a repeat", () => {
  const news = [
    "أطلقت Google Labs أداة Playground التي تتيح لأي شخص بناء لعبة كاملة من وصف مكتوب، دون الحاجة إلى برمجة.",
    "يكتب المستخدم فكرة اللعبة، فتبني الأداة نسخة قابلة للعب، ثم يعدّلها بالمحادثة: يطلب تغيير الشخصيات أو القواعد أو المراحل، وتُطبَّق التعديلات مباشرة.",
    "وتتيح الأداة مشاركة اللعبة برابط، وهي متاحة حاليًا في الولايات المتحدة.",
  ].join("\n\n");
  const idea =
    "تبني لعبة كاملة من وصف مكتوب، ثم تعدّلها بالمحادثة بتغيير الشخصيات والقواعد والمراحل، دون أن تكتب سطر برمجة واحدًا.";
  const hint = insightLengthHint(idea, news, "idea")!;
  assert.equal(hint.state, "repeats", `overlap ${hint.overlap}`);
  assert.ok(hint.words < hint.newsWords / 2 + 1);
});

test("length outranks repetition, and repetition outranks «long»", () => {
  const restated = "النموذج الجديد يكتب الاختبارات ويصلح الأخطاء ويشرح التغييرات للمطورين خطوة بخطوة";
  assert.equal(insightLengthHint(restated, NEWS, "idea")!.state, "repeats");
  assert.equal(insightLengthHint(`${restated} ${NEWS}`, NEWS, "idea")!.state, "longer");
});

test("with no news text to compare, only the counter shows", () => {
  const hint = insightLengthHint(fresh(8), "", "whyItMatters")!;
  assert.equal(hint.state, "ok");
  assert.equal(hint.newsWords, 0);
});

test("after saving, only «longer» and «repeats» are mentioned again", () => {
  assert.equal(savedWarning(insightLengthHint(fresh(30), NEWS, "note")), "أطول من الخبر");
  assert.equal(
    savedWarning(insightLengthHint("النموذج الجديد يكتب الاختبارات ويصلح الأخطاء", NEWS, "idea")),
    "يكرر الخبر",
  );
  assert.equal(savedWarning(insightLengthHint(fresh(12), NEWS, "moral")), null);
  assert.equal(savedWarning(null), null);
});
