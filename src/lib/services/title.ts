import { hostname, truncate } from "@/lib/util/text";
import { getAIClient } from "@/lib/ai/provider";
import { fetchSource, type SourceSnapshot } from "./fetch-source";
import { cleanTitle } from "./title-prompt";

/**
 * What the composer shows the member after they paste a link.
 * Deliberately no category: the member never picks one, the evaluator
 * classifies the content itself.
 */
export interface AutoLabel {
  title: string;
  /** One plain sentence describing what the link is, shown under the title. */
  summary: string;
  domain: string;
  /** "ai" when a model wrote it, "heuristic" when it came from page metadata. */
  engine: "ai" | "heuristic";
}

/**
 * Reads the pasted link and names it, so the member never types a title.
 * Never throws, a failure falls back to the page metadata, and past that to
 * the URL itself.
 */
export async function autoLabel(
  url: string,
  note = "",
  snapshotIn?: SourceSnapshot,
): Promise<AutoLabel> {
  const snapshot = snapshotIn ?? (await fetchSource(url));
  const fallback = labelFromMetadata(snapshot, url);

  const client = getAIClient();
  if (!client.enabled()) return fallback;

  try {
    const label = await client.label(snapshot, url, note);
    if (!label) return fallback;

    return {
      title: label.title,
      summary: truncate(label.summary, 240) || fallback.summary,
      domain: fallback.domain,
      engine: "ai",
    };
  } catch {
    // Offline, rate-limited, bad JSON, the metadata title is good enough.
    return fallback;
  }
}

/** Best-effort naming with no AI: page metadata first, then the URL path. */
function labelFromMetadata(
  snapshot: SourceSnapshot,
  url: string,
): AutoLabel {
  const domain = snapshot.domain || hostname(url);
  const fromPage = cleanTitle(snapshot.pageTitle ?? "");
  const title = fromPage || titleFromUrl(url) || domain || "اكتشاف بلا عنوان";

  return {
    title,
    summary: truncate((snapshot.metaDescription ?? "").trim(), 240),
    domain,
    engine: "heuristic",
  };
}

function titleFromUrl(url: string): string {
  try {
    const { pathname } = new URL(url);
    const slug = pathname.split("/").filter(Boolean).pop() ?? "";
    const words = decodeURIComponent(slug)
      .replace(/\.(html?|php|aspx?|pdf)$/i, "")
      .replace(/[-_+]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (words.length < 3) return "";
    return truncate(words.charAt(0).toUpperCase() + words.slice(1), 160);
  } catch {
    return "";
  }
}
