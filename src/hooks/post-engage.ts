import { getDb, logPost, recordEngagement } from "../data/db.js";
import { MondayBoardClient } from "../services/monday-board.js";

export interface EngagementPayload {
  platform: "twitter" | "linkedin";
  targetHandle: string;
  content: string;
  url?: string;
  theyEngaged?: boolean;
  theyFollowedBack?: boolean;
  notes?: string;
}

/**
 * Called after an engagement action (reply, comment, like, quote-tweet).
 * - Logs the post to SQLite
 * - Updates the influencer's reply count + last_engaged_at
 * - Updates Monday.com board item if monday_item_id is set
 */
export async function onPostEngage(
  payload: EngagementPayload,
  mondayToken?: string
): Promise<{ postId: number }> {
  const db = getDb();

  const postId = logPost(db, {
    platform: payload.platform,
    type: "reply",
    content: payload.content,
    url: payload.url,
    target_handle: payload.targetHandle,
  });

  recordEngagement(db, payload.targetHandle, postId);

  // Sync Monday.com if token available and influencer has a board item
  if (mondayToken) {
    const influencer = db
      .prepare("SELECT * FROM influencers WHERE handle = ?")
      .get(payload.targetHandle) as { monday_item_id?: string; replies_sent?: number } | undefined;

    if (influencer?.monday_item_id) {
      const monday = new MondayBoardClient(mondayToken);
      const today = new Date().toISOString().split("T")[0] ?? "";
      await monday.updateEngagement(influencer.monday_item_id, {
        lastEngaged: today,
        repliesSent: (influencer.replies_sent ?? 0) + 1,
        theyFollowedBack: payload.theyFollowedBack,
        theyEngaged: payload.theyEngaged,
        notes: payload.notes,
      });
    }
  }

  return { postId };
}
