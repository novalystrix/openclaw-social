/**
 * HTTP API client for the Social Activity web app.
 * Replaces local SQLite with remote API calls.
 */

export interface ApiConfig {
  appUrl: string;
  apiKey: string;
  accountId: string;
}

let _config: ApiConfig | null = null;

export function initApiClient(config: ApiConfig): void {
  _config = config;
}

export function getApiConfig(): ApiConfig | null {
  return _config;
}

async function apiFetch(path: string, options?: RequestInit): Promise<any> {
  if (!_config) throw new Error("Social API client not initialized. Set SOCIAL_APP_URL, SOCIAL_APP_KEY, SOCIAL_ACCOUNT_ID.");
  
  const url = `${_config.appUrl}/api/bot/${_config.accountId}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `Bearer ${_config.apiKey}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Social API ${res.status}: ${text}`);
  }

  return res.json();
}

export async function fetchPersonality(platform?: string): Promise<any[]> {
  const params = platform ? `?platform=${platform}` : "";
  return apiFetch(`/personality${params}`);
}

export async function listPosts(platform?: string, limit = 50): Promise<any[]> {
  const params = new URLSearchParams();
  if (platform) params.set("platform", platform);
  params.set("limit", String(limit));
  return apiFetch(`/posts?${params}`);
}

export async function logPost(post: {
  platform: string;
  postType?: string;
  text: string;
  url?: string;
  status?: string;
}): Promise<any> {
  return apiFetch("/posts", { method: "POST", body: JSON.stringify(post) });
}

export async function listEngagements(platform?: string, limit = 50): Promise<any[]> {
  const params = new URLSearchParams();
  if (platform) params.set("platform", platform);
  params.set("limit", String(limit));
  return apiFetch(`/engagements?${params}`);
}

export async function logEngagement(engagement: {
  platform: string;
  type: string;
  targetAuthor?: string;
  targetSnippet?: string;
  targetUrl?: string;
  myText?: string;
}): Promise<any> {
  return apiFetch("/engagements", { method: "POST", body: JSON.stringify(engagement) });
}

export async function fetchCorpus(): Promise<any[]> {
  return apiFetch("/corpus");
}

export async function fetchStrategy(): Promise<any[]> {
  return apiFetch("/strategy");
}

export async function fetchFeedback(status?: string): Promise<any[]> {
  const params = status ? `?status=${status}` : "";
  return apiFetch(`/feedback${params}`);
}

export async function queuePost(post: {
  platform: string;
  postType?: string;
  text: string;
  scheduledFor: string; // ISO timestamp
}): Promise<any> {
  return apiFetch("/posts", {
    method: "POST",
    body: JSON.stringify({ ...post, status: "scheduled" }),
  });
}

export async function getNextScheduledPost(platform?: string): Promise<any | null> {
  const params = platform ? `?platform=${platform}` : "";
  return apiFetch(`/posts/next${params}`);
}

export async function markPostPublished(id: string, url?: string): Promise<any> {
  return apiFetch("/posts/next", {
    method: "PATCH",
    body: JSON.stringify({ id, url }),
  });
}
