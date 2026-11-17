export type TavilySource = {
  uri: string;
  title: string;
  content: string;
};

type TavilyPayload = {
  results?: Array<{
    url?: unknown;
    title?: unknown;
    content?: unknown;
  }>;
};

/** One basic Tavily search; the free Researcher plan has a monthly credit cap. */
export async function searchTavily(
  query: string,
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<TavilySource[]> {
  const normalizedQuery = query.replace(/\s+/g, " ").trim().slice(0, 400);
  const key = apiKey.trim();
  if (!normalizedQuery) throw new Error("TAVILY_QUERY_REQUIRED");
  if (!key) throw new Error("TAVILY_API_KEY_REQUIRED");

  const response = await fetcher("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: normalizedQuery,
      search_depth: "basic",
      max_results: 8,
      include_answer: false,
      include_raw_content: false,
      include_images: false,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`TAVILY_HTTP_${response.status}`);

  const payload = await response.json() as TavilyPayload;
  const sources: TavilySource[] = [];
  const seen = new Set<string>();
  for (const result of payload.results || []) {
    if (typeof result.url !== "string" || typeof result.content !== "string") continue;
    let uri: string;
    try {
      const url = new URL(result.url);
      if (url.protocol !== "https:" || url.username || url.password) continue;
      url.hash = "";
      uri = url.toString();
    } catch {
      continue;
    }
    if (seen.has(uri)) continue;
    const content = result.content.trim().slice(0, 1800);
    if (!content) continue;
    seen.add(uri);
    sources.push({
      uri,
      title: typeof result.title === "string" && result.title.trim() ? result.title.trim().slice(0, 240) : "Web source",
      content,
    });
    if (sources.length >= 8) break;
  }
  return sources;
}
