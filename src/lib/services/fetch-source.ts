import { hostname, truncate } from "@/lib/util/text";

export interface SourceSnapshot {
  ok: boolean;
  status: number | null;
  url: string;
  finalUrl: string | null;
  domain: string;
  pageTitle: string | null;
  metaDescription: string | null;
  /** Publication date found in the page metadata, ISO or raw string. */
  publishedDate: string | null;
  /** Plain-text excerpt of the page for the evaluator to read. */
  excerpt: string | null;
  error: string | null;
}

const UA =
  "Mozilla/5.0 (compatible; AIHuntBot/0.1; +internal knowledge-sharing MVP)";

function pick(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      const value = decodeEntities(m[1]).trim();
      if (value) return value;
    }
  }
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull a publication date out of common meta tags / JSON-LD. */
function extractDate(html: string): string | null {
  const meta = pick(html, [
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']article:published_time["']/i,
    /<meta[^>]+name=["'](?:pubdate|publishdate|publication_date|date|dc\.date|citation_publication_date)["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+itemprop=["']datePublished["'][^>]+content=["']([^"']+)["']/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,
  ]);
  if (meta) return meta;

  const jsonLd = html.match(/"datePublished"\s*:\s*"([^"]+)"/i);
  if (jsonLd?.[1]) return jsonLd[1];

  // arXiv listing pages
  const arxiv = html.match(/Submitted on\s+(\d{1,2}\s+\w+\s+\d{4})/i);
  if (arxiv?.[1]) return arxiv[1];

  return null;
}

/**
 * Fetches the submitted URL server-side and pulls out whatever metadata the
 * page exposes. Never throws — a failure is just a snapshot with ok: false.
 */
export async function fetchSource(rawUrl: string): Promise<SourceSnapshot> {
  const base: SourceSnapshot = {
    ok: false,
    status: null,
    url: rawUrl,
    finalUrl: null,
    domain: hostname(rawUrl),
    pageTitle: null,
    metaDescription: null,
    publishedDate: null,
    excerpt: null,
    error: null,
  };

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
    if (!/^https?:$/.test(parsed.protocol)) {
      return { ...base, error: "يمكن التحقق من روابط http(s) فقط." };
    }
  } catch {
    return { ...base, error: "هذا لا يبدو رابطًا صالحًا." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en,ar;q=0.8",
      },
    });

    const contentType = res.headers.get("content-type") ?? "";
    const snapshot: SourceSnapshot = {
      ...base,
      ok: res.ok,
      status: res.status,
      finalUrl: res.url || parsed.toString(),
      domain: hostname(res.url || parsed.toString()),
    };

    if (!res.ok) {
      return { ...snapshot, error: `استجاب المصدر بـ HTTP ${res.status}.` };
    }
    if (!/html|text|json/i.test(contentType)) {
      return {
        ...snapshot,
        error: `المصدر من نوع ${contentType || "ملف ثنائي"}.`,
      };
    }

    const html = (await res.text()).slice(0, 600_000);
    const title = pick(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
      /<title[^>]*>([\s\S]*?)<\/title>/i,
    ]);
    const description = pick(html, [
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    ]);

    return {
      ...snapshot,
      pageTitle: title ? truncate(title, 300) : null,
      metaDescription: description ? truncate(description, 600) : null,
      publishedDate: extractDate(html),
      excerpt: truncate(htmlToText(html), 4000),
      error: null,
    };
  } catch (err) {
    const message =
      (err as Error)?.name === "AbortError"
        ? "انتهت مهلة الاتصال بالمصدر بعد 15 ثانية."
        : `تعذّر الوصول إلى المصدر (${(err as Error)?.message ?? "خطأ في الشبكة"}).`;
    return { ...base, error: message };
  } finally {
    clearTimeout(timer);
  }
}
