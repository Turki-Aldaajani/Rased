import { truncate } from "@/lib/util/text";

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string | null;
}

export type SearchProvider = "anthropic" | "tavily" | "brave" | "serper" | "none";

export function configuredProvider(): SearchProvider {
  const raw = (process.env.WEB_SEARCH_PROVIDER ?? "anthropic").toLowerCase();
  if (["anthropic", "tavily", "brave", "serper", "none"].includes(raw)) {
    return raw as SearchProvider;
  }
  return "none";
}

/**
 * True when the provider runs inside the Claude request itself
 * (server-side web_search tool) rather than as a separate HTTP call.
 */
export function providerIsInline(p: SearchProvider): boolean {
  return p === "anthropic";
}

async function tavily(query: string): Promise<SearchHit[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      max_results: 6,
      search_depth: "basic",
      include_answer: false,
    }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    results?: { title: string; url: string; content: string; published_date?: string }[];
  };
  return (data.results ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: truncate(r.content ?? "", 500),
    publishedDate: r.published_date ?? null,
  }));
}

async function brave(query: string): Promise<SearchHit[]> {
  const key = process.env.BRAVE_API_KEY;
  if (!key) return [];
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?count=6&q=${encodeURIComponent(query)}`,
    { headers: { Accept: "application/json", "X-Subscription-Token": key } },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    web?: { results?: { title: string; url: string; description: string; age?: string }[] };
  };
  return (data.web?.results ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: truncate(r.description ?? "", 500),
    publishedDate: r.age ?? null,
  }));
}

async function serper(query: string): Promise<SearchHit[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: 6 }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    organic?: { title: string; link: string; snippet: string; date?: string }[];
  };
  return (data.organic ?? []).map((r) => ({
    title: r.title,
    url: r.link,
    snippet: truncate(r.snippet ?? "", 500),
    publishedDate: r.date ?? null,
  }));
}

/**
 * Runs a standalone web search with whichever provider is configured.
 * Returns [] for "anthropic" (that search happens inside the model call)
 * and for "none". Never throws.
 */
export async function webSearch(query: string): Promise<SearchHit[]> {
  const provider = configuredProvider();
  if (provider === "anthropic" || provider === "none") return [];
  try {
    if (provider === "tavily") return await tavily(query);
    if (provider === "brave") return await brave(query);
    if (provider === "serper") return await serper(query);
  } catch {
    return [];
  }
  return [];
}
