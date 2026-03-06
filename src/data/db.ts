import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let _db: Database.Database | null = null;

export function getDb(dbPath?: string): Database.Database {
  if (_db) return _db;

  const resolvedPath = dbPath ?? join(__dirname, "../../data/social.db");
  _db = new Database(resolvedPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  const schema = readFileSync(join(__dirname, "schema.sql"), "utf-8");
  _db.exec(schema);

  return _db;
}

export interface Influencer {
  id?: number;
  name: string;
  handle: string;
  platform?: string;
  monday_item_id?: string;
  phase?: number;
  priority?: string;
  type?: string;
  last_tweet_id?: string;
  last_engaged_at?: string;
  replies_sent?: number;
  followed_back?: boolean;
  they_engaged?: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Post {
  id?: number;
  platform: string;
  type: string;
  content: string;
  url?: string;
  target_handle?: string;
  influencer_id?: number;
  posted_at?: string;
  engagement_likes?: number;
  engagement_replies?: number;
  engagement_reposts?: number;
}

export interface TweetWatch {
  id?: number;
  handle: string;
  last_tweet_id?: string;
  last_checked_at?: string;
  enabled?: boolean;
}

export function upsertTweetWatch(
  db: Database.Database,
  handle: string,
  lastTweetId?: string
): void {
  db.prepare(
    `INSERT INTO tweet_watch (handle, last_tweet_id, last_checked_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(handle) DO UPDATE SET
       last_tweet_id = COALESCE(excluded.last_tweet_id, last_tweet_id),
       last_checked_at = excluded.last_checked_at`
  ).run(handle, lastTweetId ?? null);
}

export function getTweetWatch(
  db: Database.Database,
  handle: string
): TweetWatch | undefined {
  return db
    .prepare("SELECT * FROM tweet_watch WHERE handle = ?")
    .get(handle) as TweetWatch | undefined;
}

export function getEnabledWatches(db: Database.Database): TweetWatch[] {
  return db
    .prepare("SELECT * FROM tweet_watch WHERE enabled = 1")
    .all() as TweetWatch[];
}

export function logPost(db: Database.Database, post: Post): number {
  const result = db
    .prepare(
      `INSERT INTO posts (platform, type, content, url, target_handle, influencer_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      post.platform,
      post.type,
      post.content,
      post.url ?? null,
      post.target_handle ?? null,
      post.influencer_id ?? null
    );
  return result.lastInsertRowid as number;
}

export function upsertInfluencer(
  db: Database.Database,
  influencer: Influencer
): number {
  const result = db
    .prepare(
      `INSERT INTO influencers (name, handle, platform, monday_item_id, phase, priority, type, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(handle) DO UPDATE SET
         name = excluded.name,
         monday_item_id = COALESCE(excluded.monday_item_id, monday_item_id),
         phase = COALESCE(excluded.phase, phase),
         priority = COALESCE(excluded.priority, priority),
         updated_at = datetime('now')`
    )
    .run(
      influencer.name,
      influencer.handle,
      influencer.platform ?? "twitter",
      influencer.monday_item_id ?? null,
      influencer.phase ?? 1,
      influencer.priority ?? "medium",
      influencer.type ?? "tech",
      influencer.notes ?? null
    );
  return result.lastInsertRowid as number;
}

export function recordEngagement(
  db: Database.Database,
  handle: string,
  postId: number
): void {
  db.prepare(
    `UPDATE influencers SET
       replies_sent = replies_sent + 1,
       last_engaged_at = datetime('now'),
       updated_at = datetime('now')
     WHERE handle = ?`
  ).run(handle);
}
