import { TwitterWatcher } from "./watcher/twitter-watcher.js";
import { getDb, upsertInfluencer, getEnabledWatches } from "./data/db.js";
import { initApiClient, getApiConfig, fetchPersonality, logPost as apiLogPost, logEngagement as apiLogEngagement, listPosts, listEngagements, fetchCorpus, fetchStrategy, fetchFeedback } from "./data/api-client.js";
import { MondayBoardClient } from "./services/monday-board.js";
import { canAct, recordAction, getActionCount } from "./utils/rate-limiter.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function register(api: any): void {
  const cfg = api.config?.plugins?.entries?.["openclaw-social"]?.config ?? {};
  const mondayToken = process.env["MONDAY_API_TOKEN"];
  const tavilyKey = process.env["TAVILY_API_KEY"] ?? "";

  // ── Initialize API client from env ────────────────────────────────────
  const appUrl = process.env["SOCIAL_APP_URL"] ?? cfg.appUrl;
  const apiKey = process.env["SOCIAL_APP_KEY"] ?? cfg.apiKey;
  const accountId = process.env["SOCIAL_ACCOUNT_ID"] ?? cfg.accountId;

  if (appUrl && apiKey && accountId) {
    initApiClient({ appUrl, apiKey, accountId });
    api.logger.info(`openclaw-social: API client initialized (${appUrl}, account: ${accountId})`);
  } else {
    api.logger.warn("openclaw-social: SOCIAL_APP_URL/KEY/ACCOUNT_ID not set — API features disabled, using local SQLite only");
  }

  // ── Background service: Twitter watcher ──────────────────────────────
  let watcher: TwitterWatcher | null = null;

  api.registerService({
    id: "openclaw-social.watcher",
    start() {
      if (!tavilyKey) {
        api.logger.warn("openclaw-social: TAVILY_API_KEY not set — watcher disabled");
        return;
      }
      watcher = new TwitterWatcher(
        tavilyKey,
        {
          pollIntervalMs: cfg.watchIntervalMs ?? 600_000,
          notifySession: cfg.notifySessionKey ?? "main",
          quietHours: {
            start: cfg.quietHoursStart ?? "23:00",
            end: cfg.quietHoursEnd ?? "07:00",
            tz: "America/New_York",
          },
        },
        api.logger
      );
      watcher.start();
    },
    stop() {
      watcher?.stop();
      watcher = null;
    },
  });

  // ── Tool: Fetch personality from web app ──────────────────────────────
  api.registerTool({
    name: "social_get_personality",
    description: "Fetch the social personality/voice guidelines from the Social Activity web app. Call this before writing any post or comment to get the latest personality rules.",
    parameters: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["twitter", "linkedin", "all"], description: "Filter by platform (default: all)" },
      },
      required: [],
    },
    async execute(_id: string, params: { platform?: string }) {
      if (!getApiConfig()) {
        return { content: [{ type: "text", text: "API not configured. Set SOCIAL_APP_URL, SOCIAL_APP_KEY, SOCIAL_ACCOUNT_ID." }] };
      }
      const sections = await fetchPersonality(params.platform === "all" ? undefined : params.platform);
      const text = sections.map((s: any) => {
        const header = s.platform !== "all" ? `[${s.platform}] ${s.section}` : s.section;
        return `## ${header}\n${s.content}`;
      }).join("\n\n---\n\n");
      return { content: [{ type: "text", text: text || "No personality sections found." }] };
    },
  });

  // ── Tool: Log a published post ────────────────────────────────────────
  api.registerTool({
    name: "social_log_post",
    description: "Log a published social media post. Saves to the web app AND local files. Call this immediately after posting.",
    parameters: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["twitter", "linkedin"], description: "Platform posted to" },
        type: { type: "string", enum: ["post", "thread", "reply", "quote"], description: "Post type" },
        content: { type: "string", description: "Full post content" },
        url: { type: "string", description: "URL of the published post" },
        target_handle: { type: "string", description: "Handle replied to (for replies)" },
      },
      required: ["platform", "type", "content"],
    },
    async execute(_id: string, params: { platform: string; type: string; content: string; url?: string; target_handle?: string }) {
      let apiResult = null;
      
      // Log to web app API
      if (getApiConfig()) {
        try {
          apiResult = await apiLogPost({
            platform: params.platform,
            postType: params.type,
            text: params.content,
            url: params.url,
            status: "published",
          });
        } catch (err) {
          api.logger.warn(`openclaw-social: API log failed: ${err}`);
        }
      }

      // Also log locally (backward compat)
      try {
        const db = getDb();
        db.prepare(
          `INSERT INTO posts (platform, type, content, url, target_handle) VALUES (?, ?, ?, ?, ?)`
        ).run(params.platform, params.type, params.content, params.url ?? null, params.target_handle ?? null);
      } catch { /* local DB optional */ }

      recordAction(params.platform);
      
      return {
        content: [{ type: "text", text: `Post logged${apiResult ? ` (API id: ${apiResult.id})` : " (local only)"}` }],
      };
    },
  });

  // ── Tool: Log an engagement ───────────────────────────────────────────
  api.registerTool({
    name: "social_log_engagement",
    description: "Log an engagement action (reply, comment, like) to the web app and local DB.",
    parameters: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["twitter", "linkedin"] },
        target_handle: { type: "string", description: "Handle of person engaged with" },
        content: { type: "string", description: "Your reply/comment content" },
        url: { type: "string", description: "URL of your reply or original post" },
        they_engaged: { type: "boolean", description: "Did they engage back?" },
        they_followed_back: { type: "boolean", description: "Did they follow back?" },
        notes: { type: "string", description: "Notes about interaction quality" },
      },
      required: ["platform", "target_handle", "content"],
    },
    async execute(_id: string, params: {
      platform: string; target_handle: string; content: string;
      url?: string; they_engaged?: boolean; they_followed_back?: boolean; notes?: string;
    }) {
      let apiResult = null;

      // Log to web app API
      if (getApiConfig()) {
        try {
          apiResult = await apiLogEngagement({
            platform: params.platform,
            type: "reply",
            targetAuthor: params.target_handle,
            targetUrl: params.url,
            myText: params.content,
          });
        } catch (err) {
          api.logger.warn(`openclaw-social: API engagement log failed: ${err}`);
        }
      }

      // Also log locally
      try {
        const db = getDb();
        const postResult = db.prepare(
          `INSERT INTO posts (platform, type, content, url, target_handle) VALUES (?, 'reply', ?, ?, ?)`
        ).run(params.platform, params.content, params.url ?? null, params.target_handle);
        
        db.prepare(
          `UPDATE influencers SET replies_sent = replies_sent + 1, last_engaged_at = datetime('now'), updated_at = datetime('now') WHERE handle = ?`
        ).run(params.target_handle);
      } catch { /* local DB optional */ }

      recordAction(params.platform);

      return {
        content: [{ type: "text", text: `Engagement logged${apiResult ? ` (API id: ${apiResult.id})` : " (local only)"}` }],
      };
    },
  });

  // ── Tool: Get posts from web app ──────────────────────────────────────
  api.registerTool({
    name: "social_get_posts",
    description: "List recent posts from the Social Activity web app.",
    parameters: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["twitter", "linkedin"] },
        limit: { type: "number", description: "Max results (default 20)" },
      },
      required: [],
    },
    async execute(_id: string, params: { platform?: string; limit?: number }) {
      if (!getApiConfig()) return { content: [{ type: "text", text: "API not configured." }] };
      const posts = await listPosts(params.platform, params.limit ?? 20);
      return { content: [{ type: "text", text: JSON.stringify(posts, null, 2) }] };
    },
  });

  // ── Tool: Get feedback from web app ───────────────────────────────────
  api.registerTool({
    name: "social_get_feedback",
    description: "Get team feedback on posts from the Social Activity web app. Check this before posting to incorporate recent coaching.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pending", "addressed"], description: "Filter by status" },
      },
      required: [],
    },
    async execute(_id: string, params: { status?: string }) {
      if (!getApiConfig()) return { content: [{ type: "text", text: "API not configured." }] };
      const feedback = await fetchFeedback(params.status);
      return { content: [{ type: "text", text: JSON.stringify(feedback, null, 2) }] };
    },
  });

  // ── Tool: Get corpus ──────────────────────────────────────────────────
  api.registerTool({
    name: "social_get_corpus",
    description: "Get the knowledge corpus from the Social Activity web app — reference material for writing posts.",
    parameters: { type: "object", properties: {}, required: [] },
    async execute() {
      if (!getApiConfig()) return { content: [{ type: "text", text: "API not configured." }] };
      const corpus = await fetchCorpus();
      return { content: [{ type: "text", text: JSON.stringify(corpus, null, 2) }] };
    },
  });

  // ── Tool: Get strategy ────────────────────────────────────────────────
  api.registerTool({
    name: "social_get_strategy",
    description: "Get content strategy docs from the Social Activity web app.",
    parameters: { type: "object", properties: {}, required: [] },
    async execute() {
      if (!getApiConfig()) return { content: [{ type: "text", text: "API not configured." }] };
      const strategy = await fetchStrategy();
      return { content: [{ type: "text", text: JSON.stringify(strategy, null, 2) }] };
    },
  });

  // ── Tool: Upsert influencer (local DB) ────────────────────────────────
  api.registerTool({
    name: "social_upsert_influencer",
    description: "Add or update an influencer in the local DB.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" }, handle: { type: "string" },
        platform: { type: "string", enum: ["twitter", "linkedin"] },
        monday_item_id: { type: "string" },
        phase: { type: "number", enum: [1, 2, 3, 4] },
        priority: { type: "string", enum: ["high", "medium", "low"] },
        type: { type: "string", enum: ["tech", "business", "creator", "media"] },
        notes: { type: "string" },
      },
      required: ["name", "handle"],
    },
    execute(_id: string, params: any) {
      const db = getDb();
      const id = upsertInfluencer(db, params);
      return { content: [{ type: "text", text: `Influencer @${params.handle} saved (id: ${id})` }] };
    },
  });

  // ── Tool: Watch status ────────────────────────────────────────────────
  api.registerTool({
    name: "social_watch_status",
    description: "Get Twitter watcher status and pending tweet notifications.",
    parameters: { type: "object", properties: {}, required: [] },
    execute() {
      if (!watcher) return { content: [{ type: "text", text: "Watcher not running (TAVILY_API_KEY not set?)" }] };
      const status = watcher.getStatus();
      const notifications = watcher.drainNotifications();
      const lines = [
        `Running: ${status.running}`,
        `Watching: ${status.watchList.map((h: string) => `@${h}`).join(", ")}`,
        `Last poll: ${status.lastPollAt ?? "never"}`,
        notifications.length > 0
          ? `NEW TWEETS (${notifications.length}):\n${notifications.map((e: any) => `  @${e.handle}: ${e.url}\n  "${e.text.slice(0, 120)}..."`).join("\n\n")}`
          : "No new tweets.",
      ];
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  });

  // ── Tool: Rate check ──────────────────────────────────────────────────
  api.registerTool({
    name: "social_rate_check",
    description: "Check action count this hour (LinkedIn: 30/hr, Twitter: 120/hr).",
    parameters: {
      type: "object",
      properties: { platform: { type: "string", enum: ["twitter", "linkedin"] } },
      required: ["platform"],
    },
    execute(_id: string, params: { platform: string }) {
      const count = getActionCount(params.platform);
      const ok = canAct(params.platform);
      return { content: [{ type: "text", text: `${params.platform}: ${count} actions this hour. ${ok ? "OK." : "LIMIT REACHED."}` }] };
    },
  });

  // ── Tool: Advance influencer phase ────────────────────────────────────
  api.registerTool({
    name: "social_advance_phase",
    description: "Advance an influencer to the next engagement phase on Monday.com board.",
    parameters: {
      type: "object",
      properties: {
        handle: { type: "string" },
        new_phase: { type: "number", enum: [2, 3, 4] },
      },
      required: ["handle", "new_phase"],
    },
    async execute(_id: string, params: { handle: string; new_phase: number }) {
      if (!mondayToken) return { content: [{ type: "text", text: "MONDAY_API_TOKEN not set" }] };
      const db = getDb();
      const influencer = db.prepare("SELECT * FROM influencers WHERE handle = ?").get(params.handle) as any;
      if (!influencer?.monday_item_id) return { content: [{ type: "text", text: `No Monday item ID for @${params.handle}` }] };

      const phaseLabels: Record<number, string> = { 2: "Phase 2 - Engage", 3: "Phase 3 - Deepen", 4: "Phase 4 - Partner" };
      const monday = new MondayBoardClient(mondayToken);
      await monday.advancePhase(influencer.monday_item_id, phaseLabels[params.new_phase] as any);
      db.prepare("UPDATE influencers SET phase = ?, updated_at = datetime('now') WHERE handle = ?").run(params.new_phase, params.handle);

      return { content: [{ type: "text", text: `@${params.handle} advanced to Phase ${params.new_phase}` }] };
    },
  });

  // ── Tool: Monday sync ─────────────────────────────────────────────────
  api.registerTool({
    name: "social_monday_sync",
    description: "Sync all influencers from the Monday.com board into local DB.",
    parameters: { type: "object", properties: {}, required: [] },
    async execute() {
      if (!mondayToken) return { content: [{ type: "text", text: "MONDAY_API_TOKEN not set" }] };
      const monday = new MondayBoardClient(mondayToken);
      const items = await monday.listItems();
      const db = getDb();
      let synced = 0;
      for (const item of items) {
        const handleCol = item.column_values.find((c: any) => c.id === "text_mm15amhz");
        if (!handleCol?.text) continue;
        upsertInfluencer(db, { name: item.name, handle: handleCol.text, monday_item_id: item.id });
        synced++;
      }
      return { content: [{ type: "text", text: `Synced ${synced} influencers from Monday.com` }] };
    },
  });

  // ── Slash commands ───────────────────────────────────────────────────
  api.registerCommand({ name: "watch-status", description: "Twitter watcher status", handler: () => {
    if (!watcher) return { text: "Watcher not running." };
    const s = watcher.getStatus();
    const n = watcher.drainNotifications();
    return { text: n.length === 0 ? `Watching: ${s.watchList.join(", ")}. No new tweets.` : `New tweets:\n${n.map((e: any) => `@${e.handle}: ${e.url}`).join("\n")}` };
  }});

  api.registerCommand({ name: "rate-status", description: "Action counts this hour", handler: () => {
    return { text: `LinkedIn: ${getActionCount("linkedin")}/30\nTwitter: ${getActionCount("twitter")}/120` };
  }});

  api.registerCommand({ name: "watch-list", description: "Watched Twitter accounts", handler: () => {
    const watches = getEnabledWatches(getDb());
    return { text: watches.length === 0 ? "No watches." : watches.map(w => `@${w.handle} — last: ${w.last_checked_at ?? "never"}`).join("\n") };
  }});
}
