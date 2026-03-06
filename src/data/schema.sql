CREATE TABLE IF NOT EXISTS influencers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  handle TEXT NOT NULL,
  platform TEXT DEFAULT 'twitter',
  monday_item_id TEXT,
  phase INTEGER DEFAULT 1,
  priority TEXT DEFAULT 'medium',
  type TEXT DEFAULT 'tech',
  last_tweet_id TEXT,
  last_engaged_at TEXT,
  replies_sent INTEGER DEFAULT 0,
  followed_back BOOLEAN DEFAULT 0,
  they_engaged BOOLEAN DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY,
  platform TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  url TEXT,
  target_handle TEXT,
  influencer_id INTEGER REFERENCES influencers(id),
  posted_at TEXT DEFAULT (datetime('now')),
  engagement_likes INTEGER DEFAULT 0,
  engagement_replies INTEGER DEFAULT 0,
  engagement_reposts INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tweet_watch (
  id INTEGER PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  last_tweet_id TEXT,
  last_checked_at TEXT,
  enabled BOOLEAN DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_influencers_handle ON influencers(handle);
CREATE INDEX IF NOT EXISTS idx_influencers_phase ON influencers(phase);
CREATE INDEX IF NOT EXISTS idx_posts_platform ON posts(platform);
CREATE INDEX IF NOT EXISTS idx_posts_posted_at ON posts(posted_at);
CREATE INDEX IF NOT EXISTS idx_tweet_watch_handle ON tweet_watch(handle);
