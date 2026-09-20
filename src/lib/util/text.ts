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
