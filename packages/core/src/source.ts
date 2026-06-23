import type { FeedItem } from "./feed-item.js";
import type { SourceType } from "./vocab.js";

export interface FetchContext {
  now: string;        // ISO timestamp for this run
  limit?: number;     // max items to return
}

export interface Source {
  id: string;
  type: SourceType;
  channels: string[];
  fetch(ctx: FetchContext): Promise<FeedItem[]>;
}
