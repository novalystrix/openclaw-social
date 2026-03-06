export interface WatcherConfig {
  watchList: string[];
  pollIntervalMs: number;
  notifySession: string;
  quietHours: {
    start: string; // "HH:MM"
    end: string;   // "HH:MM"
    tz: string;
  };
}

export interface NewTweetEvent {
  handle: string;
  tweetId: string;
  text: string;
  url: string;
  detectedAt: string;
}

export interface WatcherStatus {
  running: boolean;
  watchList: string[];
  pollIntervalMs: number;
  lastPollAt: string | null;
  pendingNotifications: NewTweetEvent[];
}
