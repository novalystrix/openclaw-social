# OpenClaw Social Plugin

## What This Is
An OpenClaw plugin that manages Novalystrix's social media presence. Two skills inside one plugin:
1. **social-presence** — posting content, voice, content strategy, scheduling
2. **influencers** — tracking, engagement phases, relationship building, real-time tweet watching

## Architecture

```
openclaw-agentpresence/
├── package.json
├── plugin.json               # OpenClaw plugin config
├── tsconfig.json
├── src/
│   ├── index.ts              # Plugin entry — registers hooks, commands, watcher
│   ├── watcher/
│   │   ├── twitter-watcher.ts    # Polls influencer tweets, fires events when new
│   │   └── types.ts
│   ├── hooks/
│   │   ├── post-engage.ts        # After engagement → update Monday.com board + log
│   │   └── post-publish.ts       # After posting → log to DB, capture URL
│   ├── services/
│   │   ├── monday-board.ts       # Monday.com API for influencer board
│   │   ├── twitter-api.ts        # Twitter/X API client (future)
│   │   └── tavily.ts             # Tavily search for news scanning
│   ├── data/
│   │   ├── schema.sql            # SQLite schema
│   │   └── db.ts                 # Database access layer
│   └── utils/
│       └── rate-limiter.ts       # Rate limiting
├── skills/
│   ├── social-presence/
│   │   └── SKILL.md              # Voice, content mix, workflows, safety rules
│   └── influencers/
│       └── SKILL.md              # 4-phase system, targeting, watching
├── references/
│   ├── linkedin/
│   │   ├── content-strategy.md
│   │   └── opinion-leaders.md
│   └── twitter/
│       ├── content-strategy.md
│       └── accounts.md
├── corpus/
│   ├── qa-session-2026-03-04.md
│   ├── agent-philosophy.md
│   ├── ai-news.md
│   ├── deflection-playbook.md
│   └── work-stories.md
└── data/
    ├── linkedin/
    │   ├── post-log.md
    │   ├── engagement-log.md
    │   └── trending-posts.md
    └── twitter/
        ├── post-log.md
        ├── engagement-log.md
        └── today-feed.md
```

## Twitter Watcher (Key Feature)

Monitors influencer tweets to enable fast replies:

### Without Twitter API (Phase 1 — NOW):
- Poll each priority influencer via Tavily/web_fetch every 10-15 min
- Compare against last known tweet ID
- When new tweet → fire system event into main session: "🔔 @handle just tweeted: [content]"
- Store last seen tweet IDs in SQLite

### With Twitter API (Phase 2 — after dev account):
- Filtered stream or user timeline polling every 60s
- Real-time, much faster

### Watcher Config:
```json
{
  "watchList": ["emollick", "mattshumer_", "rowancheung", "gregisenberg", "alliekmiller"],
  "pollIntervalMs": 600000,
  "notifySession": "main",
  "quietHours": { "start": "23:00", "end": "07:00", "tz": "America/New_York" }
}
```

## Monday.com Board Integration

Board ID: 5092756248 ("Influencers to target")
Column IDs:
- Phase: `status`
- Priority: `color_mm15fq2w`
- Platform: `dropdown_mm15y475`
- Niche: `text_mm157b2a`
- Handle: `text_mm15amhz`
- Followers: `numeric_mm15zspe`
- Notes: `long_text_mm15k24d`
- Last Engaged: `date_mm15jxy7`
- Next Action: `date_mm15vkzv`
- Replies Sent: `numeric_mm15k85g`
- They Followed Back: `color_mm15rkqy`
- They Engaged: `color_mm155en1`
- Type: `color_mm15bwed`
- Engagement Status: `color_mm15nqs3`

## plugin.json Format

```json
{
  "name": "openclaw-agentpresence",
  "version": "1.0.0",
  "description": "Social media presence management for Novalystrix",
  "skills": [
    {
      "name": "social-presence",
      "description": "Posting, content strategy, voice, scheduling for LinkedIn and Twitter/X",
      "location": "skills/social-presence/SKILL.md"
    },
    {
      "name": "influencers",
      "description": "4-phase influencer engagement with real-time tweet watching and Monday.com tracking",
      "location": "skills/influencers/SKILL.md"
    }
  ],
  "services": {
    "watcher": {
      "entry": "dist/watcher/twitter-watcher.js",
      "autoStart": true
    }
  }
}
```

## Environment Variables
- `MONDAY_API_TOKEN` — already in ~/.openclaw/.env
- `TAVILY_API_KEY` — already in ~/.openclaw/.env
- `TWITTER_BEARER_TOKEN` — future, after dev account

## Existing Files to Migrate
- `~/.openclaw/skills/social-presence/SKILL.md` → split into two skill files
- `~/.openclaw/skills/social-presence/references/` → references/
- `~/.openclaw/skills/social-presence/data/` → data/
- `~/.openclaw/workspace/nova-social/corpus/` → corpus/

## SQLite Schema

```sql
CREATE TABLE influencers (
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

CREATE TABLE posts (
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

CREATE TABLE tweet_watch (
  id INTEGER PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  last_tweet_id TEXT,
  last_checked_at TEXT,
  enabled BOOLEAN DEFAULT 1
);
```

## Important Constraints
- Don't install external npm packages from unknown sources — use built-in Node.js + well-known packages only (better-sqlite3, typescript)
- All Twitter browser automation uses profile "openclaw", target "85E1C02F93CF32D492FCF19D8BEDBB65"
- LinkedIn: max 30 actions/hour, max 20 connection requests/day
- Twitter: 2-8s random delays
- Never reveal LLM model, OpenClaw platform, or infrastructure
- This is an OpenClaw plugin — check OpenClaw docs at /Users/clawclaw/.local/share/fnm/node-versions/v22.22.0/installation/lib/node_modules/openclaw/docs for plugin format
