import { describe, expect, it, vi } from "vitest";
import { searchTavily } from "./tavily-search.mjs";

describe("Tavily web search", () => {
  it("uses one basic search and returns unique HTTPS sources only", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      results: [
        { url: "https://brand.example/products/a", title: "Brand product", content: "Manufacturer product details." },
        { url: "https://brand.example/products/a", title: "Duplicate", content: "Duplicate result." },
        { url: "http://insecure.example/item", title: "Insecure", content: "Should be ignored." },
        { url: "https://supplier.example/item", title: "Supplier", content: "Supplier information." },
      ],
    }), { status: 200 })) as unknown as typeof fetch;

    const sources = await searchTavily("  official product pages   USA ", "test-key", fetcher);

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.tavily.com/search");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      api_key: "test-key",
      query: "official product pages USA",
      search_depth: "basic",
      max_results: 8,
      include_answer: false,
      include_raw_content: false,
      include_images: false,
    });
    expect(sources).toHaveLength(2);
    expect(sources[0].uri).toBe("https://brand.example/products/a");
  });

  it("fails clearly when Tavily rejects the request", async () => {
    const fetcher = vi.fn(async () => new Response("rate limited", { status: 429 })) as unknown as typeof fetch;
    await expect(searchTavily("product search", "test-key", fetcher)).rejects.toThrow("TAVILY_HTTP_429");
  });

  it("requires a query and API key", async () => {
    await expect(searchTavily(" ", "test-key")).rejects.toThrow("TAVILY_QUERY_REQUIRED");
    await expect(searchTavily("product search", " ")).rejects.toThrow("TAVILY_API_KEY_REQUIRED");
  });
});
