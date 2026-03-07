#!/usr/bin/env bash
# setup.sh — Initialize openclaw-social data directory
# Idempotent: will NOT overwrite existing files.
set -e

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$PLUGIN_DIR/data"

echo "Setting up openclaw-social data directory at: $DATA_DIR"

# Create directories
mkdir -p "$DATA_DIR/linkedin"
mkdir -p "$DATA_DIR/twitter"

# Helper: create file only if it doesn't exist
create_if_missing() {
  local path="$1"
  local header="$2"
  if [ ! -f "$path" ]; then
    echo "$header" > "$path"
    echo "  created: $path"
  else
    echo "  exists:  $path (skipped)"
  fi
}

# Root data files
create_if_missing "$DATA_DIR/trending-posts.md" "# AI News Scan Results
<!-- Written by AI News Scan cron (1:30 AM ET daily) -->
<!-- Content writer reads this before queuing posts -->
"

create_if_missing "$DATA_DIR/content-queue.md" "# Content Queue
<!-- Written by content writer cron (7 AM ET daily) -->
<!-- Fallback queue — platform-specific queues in linkedin/ and twitter/ -->
"

create_if_missing "$DATA_DIR/engagement-log.md" "# Engagement Log
<!-- Local cache of engagement actions -->
<!-- Full history stored in Social Activity web app -->
"

create_if_missing "$DATA_DIR/weekly-reviews.md" "# Weekly Reviews
<!-- Written by Weekly Review cron (Sunday 10 AM ET) -->
"

# LinkedIn files
create_if_missing "$DATA_DIR/linkedin/trending-posts.md" "# LinkedIn Feed Scan Results
<!-- Written by LinkedIn Scan cron (8 AM ET daily) -->
<!-- Content writer reads this to inform LinkedIn post topics -->
"

create_if_missing "$DATA_DIR/linkedin/content-queue.md" "# LinkedIn Content Queue
<!-- Written by content writer cron (7 AM ET) -->
<!-- Publish crons (9 AM, 1 PM, 4 PM ET) read from social_publish_next API -->
"

create_if_missing "$DATA_DIR/linkedin/engagement-log.md" "# LinkedIn Engagement Log
<!-- Local cache — full history in Social Activity web app -->
"

create_if_missing "$DATA_DIR/linkedin/post-log.md" "# LinkedIn Post Log
<!-- Local cache of published LinkedIn posts -->
<!-- Full log with URLs in Social Activity web app -->
"

# Twitter files
create_if_missing "$DATA_DIR/twitter/today-feed.md" "# Twitter Feed Scan Results
<!-- Written by Twitter Scan cron (9 AM ET daily) -->
<!-- Content writer reads this to inform Twitter post topics -->
"

create_if_missing "$DATA_DIR/twitter/content-queue.md" "# Twitter Content Queue
<!-- Written by content writer cron (7 AM ET) -->
<!-- Publish crons (12 PM, 3 PM, 6 PM ET) read from social_publish_next API -->
"

create_if_missing "$DATA_DIR/twitter/engagement-log.md" "# Twitter Engagement Log
<!-- Local cache — full history in Social Activity web app -->
"

create_if_missing "$DATA_DIR/twitter/post-log.md" "# Twitter Post Log
<!-- Local cache of published Twitter posts -->
<!-- Full log with URLs in Social Activity web app -->
"

echo ""
echo "✅ openclaw-social data directory ready."
echo ""
echo "Next steps:"
echo "  1. Set env vars in ~/.openclaw/.env (SOCIAL_APP_URL, SOCIAL_APP_KEY, SOCIAL_ACCOUNT_ID)"
echo "  2. Add plugin to ~/.openclaw/openclaw.json"
echo "  3. Run: openclaw gateway restart"
echo "  4. Test: ask your agent to call social_get_personality"
