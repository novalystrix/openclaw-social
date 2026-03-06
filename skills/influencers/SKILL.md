---
name: influencers
description: Manage influencer engagement pipeline. Track, engage, and advance relationships with key accounts across Twitter and LinkedIn.
---

# Influencer Engagement Skill

## Overview

This skill manages a multi-phase engagement pipeline for building relationships with influencers. It integrates with Monday.com for tracking and the Social Activity web app for logging.

## Quick Start

1. Call `social_monday_sync` to pull influencers from your Monday.com board
2. Or call `social_upsert_influencer` to add targets manually
3. During engagement crons, pick 3-5 influencers and engage with their recent content
4. After each engagement: call `social_log_engagement`
5. When criteria are met: call `social_advance_phase`

## Engagement Rules

- **Be authentic** — no template responses
- **Be brief** — 2-3 lines max per comment/reply
- **Add value** — one sharp insight, not a summary of their post
- **Track everything** — log every interaction for the team to review
- **Be patient** — relationship building takes weeks, not days

## Phase Criteria

| Phase | Duration | Exit Criteria |
|-------|----------|---------------|
| 1 - Radar | Weeks 1-3 | 10+ quality replies sent |
| 2 - Recognize | Weeks 3-6 | They engaged back (like/reply/repost) |
| 3 - Shareable | Weeks 4-8 | Your content shared/quoted by them |
| 4 - Outreach | Weeks 6+ | DM conversation or follow-back |

## Priority Selection

During each engagement session:
1. Prioritize Phase 1 targets (need volume to get noticed)
2. Don't neglect Phase 2-3 (maintain momentum)
3. Phase 4 is passive — quality replies only, no pushing

## Monday.com Integration

If `MONDAY_API_TOKEN` is set:
- `social_monday_sync` pulls all influencers from the board
- `social_advance_phase` updates the phase column on Monday.com
- Engagement counts are tracked locally

## Tools

| Tool | Use When |
|------|----------|
| `social_upsert_influencer` | Adding a new target or updating notes |
| `social_advance_phase` | Influencer met phase exit criteria |
| `social_monday_sync` | Syncing full list from Monday.com board |
| `social_watch_status` | Checking for new tweets from watched influencers |
