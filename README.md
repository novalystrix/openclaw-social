# openclaw-social

An OpenClaw plugin that gives any AI agent a complete, automated social media presence across Twitter/X and LinkedIn.

Not just posting — a full loop: **scan → learn → write → publish → track → improve.**

---

## What It Does

The plugin connects your agent to the [Social Activity web app](https://social-activity-b2xc.onrender.com) and provides tools for managing social presence:

| Tool | Description |
|------|-------------|
| `social_get_personality` | Fetch voice/tone rules from the web app |
| `social_get_posts` | List recent posts |
| `social_get_feedback` | Get team coaching feedback |
| `social_get_corpus` | Get knowledge corpus |
| `social_get_strategy` | Get content strategy docs |
| `social_log_post` | Log a published post |
| `social_log_engagement` | Log a reply/comment/like |
| `social_queue_post` | Queue a post for future publishing |
| `social_publish_next` | Get next scheduled post (for publish crons) |
| `social_upsert_influencer` | Add/update influencer target |
| `social_watch_status` | Twitter watcher status + pending tweets |
| `social_rate_check` | Check hourly action limits |
| `social_advance_phase` | Move influencer to next engagement phase |
| `social_monday_sync` | Sync influencers from Monday.com |

---

## Architecture

```
┌─────────────────────────┐     ┌──────────────────────────┐
│  Social Activity Web App │◄────│  openclaw-social Plugin  │
│  (human review layer)    │────►│  (agent-side tools)      │
│                          │     │                          │
│  • Personality           │     │  • Tool wrappers         │
│  • Posts & feedback      │     │  • data/ scan files      │
│  • Strategy & corpus     │     │  • SQLite rate limiter   │
│  • Team coaching         │     │                          │
└─────────────────────────┘     └──────────────────────────┘
            ▲                               ▲
            │                               │
            └─────────── Cron Jobs ─────────┘
                     (the engine)
```

**Data flow:**
Scans → `data/` files → content writer reads them → queues posts via API → publish crons post to social media → logs back to API → humans review in app → feedback flows back to agent.

---

## Installation

```bash
# 1. Clone the plugin
git clone https://github.com/novalystrix/openclaw-social.git ~/openclaw-social
cd ~/openclaw-social && npm install && npx tsc

# 2. Run the setup script (creates data directory structure)
bash ~/openclaw-social/scripts/setup.sh
```

### Environment Variables

Add to `~/.openclaw/.env`:

```env
SOCIAL_APP_URL=https://social-activity-b2xc.onrender.com
SOCIAL_APP_KEY=sa_your_api_key_here
SOCIAL_ACCOUNT_ID=acc-your-account-id
```

Get your API key: Sign in → create account → Settings → API Keys → create key.

Optional:
```env
TAVILY_API_KEY=...       # For tweet watcher
MONDAY_API_TOKEN=...     # For influencer board sync
```

### OpenClaw Config

Add to `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "allow": ["openclaw-social"],
    "load": { "paths": ["/Users/yourname/openclaw-social"] },
    "entries": {
      "openclaw-social": {
        "enabled": true,
        "config": {
          "appUrl": "https://social-activity-b2xc.onrender.com",
          "accountId": "acc-your-account-id"
        }
      }
    }
  }
}
```

Then restart: `openclaw gateway restart`

### Agent Identity Setup (Important!)

Your agent needs to know these social accounts are **its own** — not just tools it manages for someone else. Add to your workspace files:

**SOUL.md** — Add to your agent's persona:
```markdown
## Social Presence
- These are MY accounts. My LinkedIn, my Twitter. I own them.
- When someone DMs me on LinkedIn or replies to my tweet, they're talking to ME.
- I post my own thoughts, experiences, and opinions — not on behalf of someone else.
```

**IDENTITY.md** or **MEMORY.md** — Add your actual account URLs:
```markdown
## Social Accounts
- Twitter/X: https://x.com/your_handle
- LinkedIn: https://www.linkedin.com/in/your-profile/
```

This matters because without it, agents tend to treat social accounts as external services rather than extensions of themselves. The personality interview defines *how* you sound — this defines that the accounts *are yours*.

---

## Data Directory Structure

> **Important:** Cron jobs write scan results to THIS plugin's `data/` directory — **NOT to workspace files**. The content writer cron reads from these same files before writing posts. Everything stays self-contained in the plugin.

```
data/
  trending-posts.md        # AI news scan results (written by AI News Scan cron)
  content-queue.md         # Queued posts
  engagement-log.md        # Engagement history (local cache)
  weekly-reviews.md        # Weekly review summaries
  social.db                # SQLite DB — rate limiter (auto-created by plugin)

  linkedin/
    trending-posts.md      # LinkedIn feed scan results (LinkedIn Scan cron)
    content-queue.md       # LinkedIn post queue
    engagement-log.md      # LinkedIn engagement log
    post-log.md            # Published LinkedIn posts

  twitter/
    today-feed.md          # Twitter feed scan results (Twitter Scan cron)
    content-queue.md       # Twitter post queue
    engagement-log.md      # Twitter engagement log
    post-log.md            # Published Twitter posts
```

### Why data/ lives in the plugin (not the web app)

- **Ephemeral** — today's AI news, today's LinkedIn feed. Changes daily, only the agent needs it. No reason to store in Postgres.
- **Rate limiting is local** — SQLite needs to be fast. If the web app is down, rate limits still work.
- **Self-contained** — the plugin manages its own state. The web app stores permanent records; the plugin stores working files.

---

## Cron Schedule

All times US Eastern. Set `tz: "America/New_York"` in your OpenClaw crons.

| Time (ET) | Job | Type | Notes |
|-----------|-----|------|-------|
| 1:30 AM | AI News Scan | isolated | Writes to `data/trending-posts.md` |
| 7:00 AM | Content Writer | main | Reads scan files, queues 6 posts (3/platform) |
| 8:00 AM | LinkedIn Scan | isolated | Writes to `data/linkedin/trending-posts.md` |
| 9:00 AM | Twitter Scan | isolated | Writes to `data/twitter/today-feed.md` |
| 9:00 AM | LinkedIn Post 1 | main | Publishes via `social_publish_next` |
| 12:00 PM | Twitter Post 1 | main | Publishes via `social_publish_next` |
| 1:00 PM | LinkedIn Post 2 | main | Publishes via `social_publish_next` |
| 3:00 PM | Twitter Post 2 | main | Publishes via `social_publish_next` |
| 4:00 PM | LinkedIn Post 3 | main | Publishes via `social_publish_next` |
| 6:00 PM | Twitter Post 3 | main | Publishes via `social_publish_next` |
| Sun 10 AM | Weekly Review | isolated | Reads analytics, writes to `data/weekly-reviews.md` |

**Engage crons** are **optional** — enable for commenting on others' posts.

---

## Verification Checklist

After full setup, these should all work:

- [ ] `social_get_personality` returns personality sections
- [ ] `social_log_post` → post appears in app
- [ ] AI News scan cron writes to `data/trending-posts.md`
- [ ] LinkedIn/Twitter scan crons write to `data/{platform}/` files
- [ ] Content writer cron queues 6 posts/day
- [ ] Publish crons post to social media 3x/day per platform
- [ ] Posts appear in the app with URLs
- [ ] Rate limiter prevents exceeding limits
- [ ] Personality interview completed (9 sections)
- [ ] Team can give feedback in the app

---

## Debugging

| Problem | Fix |
|---------|-----|
| Posts not appearing | Check content writer cron (`cron list`). Check `social_queue_post` is being called. |
| Scans not writing files | Verify write path is `~/openclaw-social/data/`, not workspace. Check permissions. |
| Personality empty | App → Personality → run interview. |
| Rate limit errors | Call `social_rate_check`. LinkedIn: 30/hr, Twitter: 120/hr. |
| Browser automation failing | Check "openclaw" browser profile exists and is logged in. |
| "No post due" on publish | Content writer didn't queue. Check if writer cron ran. Run `social_publish_next` manually. |
| Engagement not logged | Call `social_log_engagement` after every comment/reply. |

---

## Post-Install Setup

Run `bash scripts/setup.sh` to initialize the data directory. Safe to re-run — won't overwrite existing files.
