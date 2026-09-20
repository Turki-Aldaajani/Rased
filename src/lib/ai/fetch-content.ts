import { truncate } from "@/lib/util/text";
import type { SourceSnapshot } from "@/lib/services/fetch-source";

/**
 * Reading a page for a model that cannot read it itself.
 *
 * Claude opens the link through its own server-side web_fetch tool. DeepSeek
 * has no such tool, its API takes text and nothing else, so when that
 * provider is selected the app has to do the reading and hand over the words.
 *
 * Deliberately no new dependency: `fetch-source.ts` already strips a page to
 * plain text with the same regex pass, and it is the extraction the Claude
 * path has been using all along. What this module adds is a longer budget
 * (a summary needs more than the 4k excerpt), an explicit content-type gate,
 * and a plain Arabic reason when a page cannot be read, a PDF or a
 * JavaScript-rendered app must come back as a sentence the member
 * understands, not as an unexplained failure.
 */

const UA =
  "Mozilla/5.0 (compatible; RasedBot/0.1; +internal knowledge-sharing MVP)";

/** Enough for a title, a summary and an evaluation; short of the context cap. */
const MAX_CHARS = 8000;

/** Below this a "successful" fetch has really returned a shell, not an article. */
const THIN_TEXT = 220;

const TIMEOUT_MS = 10_000;

export interface ReadableContent {
  ok: boolean;
  url: string;
  finalUrl: string | null;
  /** Readable page text, capped at MAX_CHARS. Empty when ok is false. */
  text: string;
  contentType: string | null;
  /** A sentence for the member, in Arabic, when ok is false. */
  error: string | null;
}

function fail(url: string, error: string, extra: Partial<ReadableContent> = {}): ReadableContent {
  return {
    ok: false,
    url,
    finalUrl: null,
    text: "",
    contentType: null,
    error,
    ...extra,
  };
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
      .replace(/<head\b[\s\S]*?<\/head>/gi, " ")
      .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer\b[\s\S]*?<\/footer>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Turns a content-type the extractor cannot read into words for the member. */
function unreadableTypeMessage(contentType: string): string {
  const type = contentType.split(";")[0].trim().toLowerCase();
  if (type === "application/pdf") {
    return "هذا الرابط ملف PDF، والمزوّد الحالي (DeepSeek) لا يقرأ الملفات، الصق صفحة الإعلان أو المقال بدل الملف.";
  }
  if (type.startsWith("image/") || type.startsWith("video/") || type.startsWith("audio/")) {
    return "هذا الرابط ملف وسائط وليس صفحة نصية، فلا يمكن قراءته.";
  }
  return `هذا الرابط من نوع ${type || "غير نصي"}، ولا يمكن استخراج نص منه.`;
}

/**
 * The page text a text-only model needs.
 *
 * `snapshot` is the read the pipeline already performed. When it carries
 * enough text this reuses it rather than opening the same URL twice; only a
 * thin or failed snapshot is refetched with the larger budget.
 */
export async function fetchReadableContent(
  url: string,
  snapshot?: SourceSnapshot,
): Promise<ReadableContent> {
  if (snapshot?.ok && (snapshot.excerpt?.length ?? 0) >= THIN_TEXT) {
    return {
      ok: true,
      url,
      finalUrl: snapshot.finalUrl,
      text: truncate(snapshot.excerpt ?? "", MAX_CHARS),
      contentType: null,
      error: null,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) {
      return fail(url, "يمكن قراءة روابط http(s) فقط.");
    }
  } catch {
    return fail(url, "هذا لا يبدو رابطًا صالحًا.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
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
    const finalUrl = res.url || parsed.toString();

    if (!res.ok) {
      return fail(url, `استجاب المصدر بـ HTTP ${res.status}، فتعذّرت قراءة محتواه.`, {
        finalUrl,
        contentType,
      });
    }

    // Checked before reading the body: downloading a PDF to throw it away is
    // wasted time, and the member deserves the real reason.
    if (!/html|text|json|xml/i.test(contentType)) {
      return fail(url, unreadableTypeMessage(contentType), {
        finalUrl,
        contentType,
      });
    }

    const body = (await res.text()).slice(0, 600_000);
    const text = /html|xml/i.test(contentType) ? htmlToText(body) : body.trim();

    if (text.length < THIN_TEXT) {
      // Almost always a single-page app: the server returned a shell and the
      // article is drawn by JavaScript, which a plain fetch never runs.
      return fail(
        url,
        "فُتحت الصفحة لكنها لا تحتوي نصًا قابلًا للقراءة، على الأرجح تُعرض بجافاسكربت. جرّب رابطًا مباشرًا للمقال أو للإعلان الأصلي.",
        { finalUrl, contentType },
      );
    }

    return {
      ok: true,
      url,
      finalUrl,
      text: truncate(text, MAX_CHARS),
      contentType,
      error: null,
    };
  } catch (err) {
    const message =
      (err as Error)?.name === "AbortError"
        ? `انتهت مهلة قراءة المصدر بعد ${TIMEOUT_MS / 1000} ثوانٍ.`
        : `تعذّر الوصول إلى المصدر (${(err as Error)?.message ?? "خطأ في الشبكة"}).`;
    return fail(url, message);
  } finally {
    clearTimeout(timer);
  }
}
