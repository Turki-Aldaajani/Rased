const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "with", "is",
  "are", "it", "its", "this", "that", "new", "now", "how", "what", "you",
  "your", "we", "our", "can", "will", "has", "have", "from", "by", "at", "as",
  "be", "was", "were", "but", "not", "they", "their", "more", "about", "just",
  "released", "release", "launch", "launched", "announces", "announced",
  "announcement", "introducing", "introduce", "update", "updates",
]);

export function tokenize(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\u0600-\u06FF\s.-]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ""))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Jaccard similarity over significant tokens. Cheap, good enough for an MVP. */
export function similarity(a: string, b: string): number {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return shared / (A.size + B.size - shared);
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** True when the two URLs point at the same page (ignoring query/hash). */
export function sameResource(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    const norm = (u: URL) =>
      u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/+$/, "");
    return norm(ua) === norm(ub);
  } catch {
    return false;
  }
}

export function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}

/** Counts words that carry meaning, used to judge effort in "why useful". */
export function meaningfulWordCount(s: string): number {
  return tokenize(s).length;
}

/*
 * Arabic-aware word comparison, for telling when one passage says what
 * another already said. Shared by the newsletter checks and the reviewers'
 * length hint, so both agree on what counts as the same word.
 */

/** The same letter written different ways reads as one: hamza forms, ta marbuta, diacritics. */
export function normaliseArabic(text: string): string {
  return (text || "")
    .toLowerCase()
    // Digits first: they sit inside the diacritics range below (U+064B..U+0670).
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

function wordsOf(text: string): string[] {
  return normaliseArabic(text).match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function wordCount(text: string): number {
  return wordsOf(text).length;
}

/** Joining words that carry no content of their own, normalised like the text. */
const ARABIC_STOP_WORDS = new Set(
  [
    "في", "من", "على", "و", "أن", "إن", "إلى", "الى", "عن", "مع", "ما", "لا", "لم", "لن",
    "هذا", "هذه", "ذلك", "تلك", "التي", "الذي", "الذين", "كل", "أو", "ثم", "قد", "كان",
    "كانت", "هو", "هي", "هم", "بين", "حتى", "عند", "بعد", "قبل", "دون", "عبر", "أي", "كما",
    "لكن", "بل", "به", "بها", "له", "لها", "فيه", "فيها", "منه", "منها", "عليه", "عليها",
    "إذا", "اذا", "أكثر", "أيضا", "أيضًا", "يمكن", "مثل", "غير", "حيث", "ليس", "كيف", "لماذا",
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is", "are",
  ].map(normaliseArabic),
);

/** Article and one-letter prefixes off, so «والتعديل» and «التعديل» and «تعديل» meet. */
const ARABIC_PREFIXES = ["وال", "بال", "كال", "فال", "لل", "ال", "و", "ب", "ل", "ف"];

function stem(word: string): string {
  for (const p of ARABIC_PREFIXES) {
    if (word.startsWith(p) && word.length - p.length >= 3) return word.slice(p.length);
  }
  return word;
}

/** Normalised, stemmed words with the joining words left out. */
export function contentWords(text: string): string[] {
  return wordsOf(text)
    .filter((w) => !ARABIC_STOP_WORDS.has(w))
    .map(stem);
}

/**
 * Two stems name the same thing when equal, or when one is the other plus an
 * ending («تعدلها» / «تعدل»). Loose on purpose: callers only ever advise.
 */
export function sameStem(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 3 && long.startsWith(short);
}

function distinctWords(text: string): string[] {
  return [...new Set(contentWords(text))];
}

/** Share of `part`'s content words that `whole` already has, 0..1. */
export function textOverlap(part: string, whole: string): number {
  const mine = distinctWords(part);
  if (mine.length === 0) return 0;
  const theirs = distinctWords(whole);
  return mine.filter((w) => theirs.some((t) => sameStem(w, t))).length / mine.length;
}

/**
 * Jaccard similarity over normalised Arabic content words, 0..1. A rewording
 * that keeps the same nouns scores high; two passages about the same thing
 * that say different things about it score low.
 */
export function textSimilarity(a: string, b: string): number {
  const A = distinctWords(a);
  const B = distinctWords(b);
  if (A.length === 0 || B.length === 0) return 0;
  const shared = A.filter((w) => B.some((t) => sameStem(w, t))).length;
  return shared / (A.length + B.length - shared);
}

/** Below this many content words, a passage is too short to call a restatement. */
const MIN_RESTATEMENT_WORDS = 4;

/**
 * How far two passages say the same thing, 0..1. Jaccard alone misses a short
 * sentence that repeats one clause of a long paragraph, so the shorter one's
 * share already in the longer counts too.
 */
export function restatement(a: string, b: string): number {
  const [short, long] =
    distinctWords(a).length <= distinctWords(b).length ? [a, b] : [b, a];
  const contained =
    distinctWords(short).length >= MIN_RESTATEMENT_WORDS ? textOverlap(short, long) : 0;
  return Math.max(textSimilarity(a, b), contained);
}
