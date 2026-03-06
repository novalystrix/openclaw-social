const BOARD_ID = "5092756248";

const COLUMN_IDS = {
  phase: "status",
  priority: "color_mm15fq2w",
  platform: "dropdown_mm15y475",
  niche: "text_mm157b2a",
  handle: "text_mm15amhz",
  followers: "numeric_mm15zspe",
  notes: "long_text_mm15k24d",
  lastEngaged: "date_mm15jxy7",
  nextAction: "date_mm15vkzv",
  repliesSent: "numeric_mm15k85g",
  theyFollowedBack: "color_mm15rkqy",
  theyEngaged: "color_mm155en1",
  type: "color_mm15bwed",
  engagementStatus: "color_mm15nqs3",
} as const;

export type PhaseLabel = "Phase 1 - Lurk" | "Phase 2 - Engage" | "Phase 3 - Deepen" | "Phase 4 - Partner";

export interface InfluencerBoardItem {
  name: string;
  handle: string;
  platform?: string;
  niche?: string;
  phase?: PhaseLabel;
  priority?: string;
  followers?: number;
  notes?: string;
  repliesSent?: number;
  theyFollowedBack?: boolean;
  theyEngaged?: boolean;
}

export interface MondayItem {
  id: string;
  name: string;
  column_values: Array<{ id: string; text: string }>;
}

export class MondayBoardClient {
  private readonly apiToken: string;
  private readonly apiUrl = "https://api.monday.com/v2";

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  private async query<T = unknown>(gql: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.apiToken,
        "API-Version": "2024-01",
      },
      body: JSON.stringify({ query: gql, variables }),
    });

    if (!response.ok) {
      throw new Error(`Monday.com API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { data: T; errors?: unknown[] };
    if (data.errors?.length) {
      throw new Error(`Monday.com GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    return data.data;
  }

  async createItem(item: InfluencerBoardItem): Promise<string> {
    const columnValues: Record<string, unknown> = {};

    if (item.handle) columnValues[COLUMN_IDS.handle] = item.handle;
    if (item.platform) columnValues[COLUMN_IDS.platform] = { labels: [item.platform] };
    if (item.niche) columnValues[COLUMN_IDS.niche] = item.niche;
    if (item.followers) columnValues[COLUMN_IDS.followers] = item.followers;
    if (item.notes) columnValues[COLUMN_IDS.notes] = { text: item.notes };
    if (item.repliesSent !== undefined) columnValues[COLUMN_IDS.repliesSent] = item.repliesSent;

    const gql = `
      mutation CreateItem($boardId: ID!, $name: String!, $columnValues: JSON!) {
        create_item(board_id: $boardId, item_name: $name, column_values: $columnValues) {
          id
        }
      }
    `;

    const result = await this.query<{ create_item: { id: string } }>(gql, {
      boardId: BOARD_ID,
      name: item.name,
      columnValues: JSON.stringify(columnValues),
    });

    return result.create_item.id;
  }

  async updateEngagement(
    itemId: string,
    updates: {
      lastEngaged?: string;
      repliesSent?: number;
      theyFollowedBack?: boolean;
      theyEngaged?: boolean;
      notes?: string;
      nextAction?: string;
    }
  ): Promise<void> {
    const columnValues: Record<string, unknown> = {};

    if (updates.lastEngaged) columnValues[COLUMN_IDS.lastEngaged] = { date: updates.lastEngaged };
    if (updates.repliesSent !== undefined) columnValues[COLUMN_IDS.repliesSent] = updates.repliesSent;
    if (updates.theyFollowedBack !== undefined) {
      columnValues[COLUMN_IDS.theyFollowedBack] = { label: updates.theyFollowedBack ? "Yes" : "No" };
    }
    if (updates.theyEngaged !== undefined) {
      columnValues[COLUMN_IDS.theyEngaged] = { label: updates.theyEngaged ? "Yes" : "No" };
    }
    if (updates.notes) columnValues[COLUMN_IDS.notes] = { text: updates.notes };
    if (updates.nextAction) columnValues[COLUMN_IDS.nextAction] = { date: updates.nextAction };

    const gql = `
      mutation UpdateItem($itemId: ID!, $boardId: ID!, $columnValues: JSON!) {
        change_multiple_column_values(item_id: $itemId, board_id: $boardId, column_values: $columnValues) {
          id
        }
      }
    `;

    await this.query(gql, {
      itemId,
      boardId: BOARD_ID,
      columnValues: JSON.stringify(columnValues),
    });
  }

  async advancePhase(itemId: string, newPhase: PhaseLabel): Promise<void> {
    const columnValues: Record<string, unknown> = {
      [COLUMN_IDS.phase]: { label: newPhase },
    };

    const gql = `
      mutation UpdatePhase($itemId: ID!, $boardId: ID!, $columnValues: JSON!) {
        change_multiple_column_values(item_id: $itemId, board_id: $boardId, column_values: $columnValues) {
          id
        }
      }
    `;

    await this.query(gql, {
      itemId,
      boardId: BOARD_ID,
      columnValues: JSON.stringify(columnValues),
    });
  }

  async listItems(): Promise<MondayItem[]> {
    const gql = `
      query ListItems($boardId: ID!) {
        boards(ids: [$boardId]) {
          items_page(limit: 200) {
            items {
              id
              name
              column_values {
                id
                text
              }
            }
          }
        }
      }
    `;

    const result = await this.query<{
      boards: Array<{ items_page: { items: MondayItem[] } }>;
    }>(gql, { boardId: BOARD_ID });

    return result.boards[0]?.items_page?.items ?? [];
  }
}
