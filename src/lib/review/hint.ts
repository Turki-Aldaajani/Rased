import { INSIGHT_HINT, type ReviewField } from "./roles";

/**
 * «ما وراء الخبر» summarises and simplifies, so it should always be shorter
 * than the news it sits under, and add to it rather than say it again. This
 * measures one field against the card's news text. It only advises: nothing
 * here ever blocks a save.
 */

/** The fields this applies to: every «ما وراء الخبر» field, never the link. */
export const HINT_FIELDS: readonly ReviewField[] = ["whyItMatters", "moral", "note", "fitText", "idea"];

/** «مناسب لـ» is a short list by nature; sharing words with the news is expected. */
const NO_REPEAT_CHECK: readonly ReviewField[] = ["fitText"];

export type HintState = "ok" | "long" | "longer" | "repeats";

export interface InsightHint {
  state: HintState;
  words: number;
  newsWords: number;
  /** Share of the field's content words found in the news, 0..1; null when not checked. */
  overlap: number | null;
  /** The line under the counter, or null when there is nothing to say. */
  message: string | null;
}

export const HINT_MESSAGES: Record<Exclude<HintState, "ok">, string> = {
  long: "أطول من المفضل، حاول تختصره",
  longer: "أطول من الخبر نفسه، اختصره",
  repeats: "يكرر كلمات الخبر، أضف ما وراءه بدل إعادته",
};

/** The same letter written different ways reads as one: hamza forms, ta marbuta, diacritics. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

function words(text: string): string[] {
  return normalise(text).match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Joining words that carry no content of their own, normalised like the text. */
const STOP_WORDS = new Set(
  [
    "في", "من", "على", "و", "أن", "إن", "إلى", "الى", "عن", "مع", "ما", "لا", "لم", "لن",
    "هذا", "هذه", "ذلك", "تلك", "التي", "الذي", "الذين", "كل", "أو", "ثم", "قد", "كان",
    "كانت", "هو", "هي", "هم", "بين", "حتى", "عند", "بعد", "قبل", "دون", "عبر", "أي", "كما",
    "لكن", "بل", "به", "بها", "له", "لها", "فيه", "فيها", "منه", "منها", "عليه", "عليها",
    "إذا", "اذا", "أكثر", "أيضا", "أيضًا", "يمكن", "مثل", "غير", "حيث", "ليس", "كيف", "لماذا",
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is", "are",
  ].map(normalise),
);

/** Article and one-letter prefixes off, so «والتعديل» and «التعديل» and «تعديل» meet. */
const PREFIXES = ["وال", "بال", "كال", "فال", "لل", "ال", "و", "ب", "ل", "ف"];

function stem(word: string): string {
  for (const p of PREFIXES) {
    if (word.startsWith(p) && word.length - p.length >= 3) return word.slice(p.length);
  }
  return word;
}

function contentWords(text: string): string[] {
  return words(text)
    .filter((w) => !STOP_WORDS.has(w))
    .map(stem);
}

/**
 * Two stems name the same thing when equal, or when one is the other plus an
 * ending («تعدلها» / «تعدل»). Loose on purpose: this is a hint, not a verdict.
 */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 3 && long.startsWith(short);
}

export function wordCount(text: string): number {
  return words(text).length;
}

/**
 * Where a «ما وراء الخبر» field stands against the news text. Null for an
 * empty field: nothing is shown under it.
 */
export function insightLengthHint(
  fieldText: string,
  newsText: string,
  field: ReviewField,
): InsightHint | null {
  const count = wordCount(fieldText);
  if (count === 0) return null;
  const newsWords = wordCount(newsText);

  let overlap: number | null = null;
  if (!NO_REPEAT_CHECK.includes(field)) {
    const mine = contentWords(fieldText);
    if (mine.length >= INSIGHT_HINT.minRepeatWords) {
      const news = contentWords(newsText);
      overlap = mine.filter((w) => news.some((n) => sameWord(w, n))).length / mine.length;
    }
  }

  // Most serious first: longer than the news, then a restatement, then long.
  const ratio = newsWords > 0 ? count / newsWords : 0;
  const state: HintState =
    newsWords > 0 && ratio >= INSIGHT_HINT.longer
      ? "longer"
      : overlap !== null && overlap > INSIGHT_HINT.repeat
        ? "repeats"
        : newsWords > 0 && ratio >= INSIGHT_HINT.long
          ? "long"
          : "ok";

  return {
    state,
    words: count,
    newsWords,
    overlap,
    message: state === "ok" ? null : HINT_MESSAGES[state],
  };
}

/** The counter line, e.g. "24 كلمة · الخبر 58 كلمة". */
export function hintCounter(hint: InsightHint): string {
  return `${hint.words} كلمة · الخبر ${hint.newsWords} كلمة`;
}

/** The two states worth one last mention after saving. */
export function savedWarning(hint: InsightHint | null): string | null {
  if (hint?.state === "longer") return "أطول من الخبر";
  if (hint?.state === "repeats") return "يكرر الخبر";
  return null;
}
