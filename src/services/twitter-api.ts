/**
 * Twitter/X API client — Phase 2 (requires developer account + bearer token).
 *
 * Phase 1: Use Tavily-based polling in twitter-watcher.ts instead.
 * Phase 2: Swap in this client once TWITTER_BEARER_TOKEN is available.
 */

export interface Tweet {
  id: string;
  text: string;
  author_id: string;
  created_at?: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
  };
}

export interface UserTimeline {
  data: Tweet[];
  meta?: {
    newest_id: string;
    oldest_id: string;
    result_count: number;
    next_token?: string;
  };
}

export class TwitterApiClient {
  private readonly bearerToken: string;
  private readonly baseUrl = "https://api.twitter.com/2";

  constructor(bearerToken: string) {
    this.bearerToken = bearerToken;
  }

  private async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.bearerToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Twitter API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  async getUserByUsername(username: string): Promise<{ id: string; name: string; username: string }> {
    const data = await this.get<{ data: { id: string; name: string; username: string } }>(
      `/users/by/username/${username}`
    );
    return data.data;
  }

  async getUserTimeline(
    userId: string,
    options: { sinceId?: string; maxResults?: number } = {}
  ): Promise<UserTimeline> {
    const params: Record<string, string> = {
      "tweet.fields": "created_at,public_metrics,author_id",
      max_results: String(options.maxResults ?? 10),
    };

    if (options.sinceId) {
      params["since_id"] = options.sinceId;
    }

    return this.get<UserTimeline>(`/users/${userId}/tweets`, params);
  }

  async getLatestTweet(username: string, sinceId?: string): Promise<Tweet | null> {
    const user = await this.getUserByUsername(username);
    const timeline = await this.getUserTimeline(user.id, { sinceId, maxResults: 5 });
    return timeline.data?.[0] ?? null;
  }
}
