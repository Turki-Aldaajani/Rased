import { contentWords, sameStem, wordCount } from "@/lib/util/text";
import { INSIGHT_HINT, type ReviewField } from "./roles";

export { wordCount };

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
      overlap = mine.filter((w) => news.some((n) => sameStem(w, n))).length / mine.length;
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
