import { TavilyClient } from "../services/tavily.js";
import { getDb, upsertTweetWatch, getTweetWatch, getEnabledWatches } from "../data/db.js";
import type { WatcherConfig, NewTweetEvent, WatcherStatus } from "./types.js";

const DEFAULT_CONFIG: WatcherConfig = {
  watchList: ["emollick", "mattshumer_", "rowancheung", "gregisenberg", "alliekmiller"],
  pollIntervalMs: 600_000, // 10 minutes
  notifySession: "main",
  quietHours: { start: "23:00", end: "07:00", tz: "America/New_York" },
};

export class TwitterWatcher {
  private config: WatcherConfig;
  private tavily: TavilyClient;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastPollAt: string | null = null;
  private pendingNotifications: NewTweetEvent[] = [];
  private readonly logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };

  constructor(
    tavilyApiKey: string,
    config: Partial<WatcherConfig> = {},
    logger?: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void }
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tavily = new TavilyClient(tavilyApiKey);
    this.logger = logger ?? {
      info: (msg) => console.log(`[twitter-watcher] ${msg}`),
      warn: (msg) => console.warn(`[twitter-watcher] ${msg}`),
      error: (msg) => console.error(`[twitter-watcher] ${msg}`),
    };
  }

  start(): void {
    if (this.timer) return;

    // Seed watch list into DB if not already there
    const db = getDb();
    for (const handle of this.config.watchList) {
      upsertTweetWatch(db, handle);
    }

    this.logger.info(`Starting — watching ${this.config.watchList.length} accounts, interval ${this.config.pollIntervalMs}ms`);

    // Run first poll immediately, then on interval
    void this.poll();
    this.timer = setInterval(() => void this.poll(), this.config.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.info("Stopped");
    }
  }

  getStatus(): WatcherStatus {
    return {
      running: this.timer !== null,
      watchList: this.config.watchList,
      pollIntervalMs: this.config.pollIntervalMs,
      lastPollAt: this.lastPollAt,
      pendingNotifications: [...this.pendingNotifications],
    };
  }

  /** Drain and return all pending notifications. */
  drainNotifications(): NewTweetEvent[] {
    const events = [...this.pendingNotifications];
    this.pendingNotifications = [];
    return events;
  }

  private isQuietHours(): boolean {
    const { start, end, tz } = this.config.quietHours;
    try {
      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: tz,
      });
      const [h, m] = timeStr.split(":").map(Number);
      const current = (h ?? 0) * 60 + (m ?? 0);

      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      const startMin = (sh ?? 0) * 60 + (sm ?? 0);
      const endMin = (eh ?? 0) * 60 + (em ?? 0);

      if (startMin > endMin) {
        // Spans midnight: quiet if current >= start OR current < end
        return current >= startMin || current < endMin;
      }
      return current >= startMin && current < endMin;
    } catch {
      return false;
    }
  }

  private async poll(): Promise<void> {
    if (this.isQuietHours()) {
      this.logger.info("Quiet hours — skipping poll");
      return;
    }

    this.lastPollAt = new Date().toISOString();
    const db = getDb();
    const watches = getEnabledWatches(db);

    for (const watch of watches) {
      try {
        const tweets = await this.tavily.getLatestTweets(watch.handle);
        if (tweets.length === 0) continue;

        // Sort by tweet ID descending (higher ID = newer)
        const sorted = tweets.sort((a, b) => (BigInt(b.tweetId) > BigInt(a.tweetId) ? 1 : -1));
        const newest = sorted[0];
        if (!newest) continue;

        const isNew = !watch.last_tweet_id || BigInt(newest.tweetId) > BigInt(watch.last_tweet_id);

        if (isNew) {
          const event: NewTweetEvent = {
            handle: watch.handle,
            tweetId: newest.tweetId,
            text: newest.text,
            url: newest.url,
            detectedAt: new Date().toISOString(),
          };

          this.pendingNotifications.push(event);
          this.logger.info(`New tweet from @${watch.handle}: ${newest.url}`);

          upsertTweetWatch(db, watch.handle, newest.tweetId);
        }
      } catch (err) {
        this.logger.warn(`Failed to check @${watch.handle}: ${String(err)}`);
      }

      // Small delay between handles to avoid hammering Tavily
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}
