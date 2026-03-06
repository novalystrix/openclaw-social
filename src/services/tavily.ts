export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

export interface TavilySearchResponse {
  query: string;
  results: TavilySearchResult[];
  answer?: string;
}

export interface TweetCandidate {
  tweetId: string;
  text: string;
  url: string;
  publishedDate?: string;
}

export class TavilyClient {
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.tavily.com";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(
    query: string,
    options: { maxResults?: number; includeDomains?: string[] } = {}
  ): Promise<TavilySearchResponse> {
    const response = await fetch(`${this.baseUrl}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: options.maxResults ?? 5,
        include_domains: options.includeDomains,
        search_depth: "basic",
      }),
    });

    if (!response.ok) {
      throw new Error(`Tavily search failed: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<TavilySearchResponse>;
  }

  async getLatestTweets(handle: string): Promise<TweetCandidate[]> {
    const query = `site:twitter.com OR site:x.com from:${handle}`;
    const results = await this.search(query, {
      maxResults: 5,
      includeDomains: ["twitter.com", "x.com"],
    });

    return results.results
      .filter((r) => this.looksLikeTweet(r.url, handle))
      .map((r) => ({
        tweetId: this.extractTweetId(r.url) ?? "",
        text: r.content,
        url: r.url,
        publishedDate: r.published_date,
      }))
      .filter((t) => t.tweetId !== "");
  }

  private looksLikeTweet(url: string, handle: string): boolean {
    const lowerHandle = handle.toLowerCase();
    const lowerUrl = url.toLowerCase();
    return (
      (lowerUrl.includes("twitter.com") || lowerUrl.includes("x.com")) &&
      lowerUrl.includes(lowerHandle) &&
      lowerUrl.includes("/status/")
    );
  }

  private extractTweetId(url: string): string | null {
    const match = url.match(/\/status\/(\d+)/);
    return match?.[1] ?? null;
  }
}
