import { z } from "zod";
import { CHANNELS, type FeedItem } from "@khazana/core";

export interface LlmClient {
  complete(prompt: string): Promise<string>;
}

const EnrichResponseSchema = z.object({
  topics: z.array(z.string()),
  entities: z.array(z.string()),
  summary: z.string(),
});

const CHANNEL_SET = new Set<string>(CHANNELS);

export function buildEnrichPrompt(item: FeedItem): string {
  return [
    "You enrich a content item for a personal knowledge feed.",
    "Return STRICT JSON only, no prose, matching exactly:",
    '{ "topics": string[], "entities": string[], "summary": string }',
    `topics MUST be chosen ONLY from this fixed list: ${CHANNELS.join(", ")}.`,
    "Drop any topic not in that list. entities = notable people, orgs, or places.",
    "summary = at most 2 sentences, factual, no opinions.",
    "",
    `Title: ${item.title}`,
    item.body ? `Body: ${item.body.slice(0, 2000)}` : "",
    `Source: ${item.source} (${item.sourceType})`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function parseEnrichResponse(
  text: string,
): { topics: string[]; entities: string[]; summary: string } | null {
  const stripped = text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  let raw: unknown;
  try {
    raw = JSON.parse(stripped);
  } catch {
    return null;
  }
  const parsed = EnrichResponseSchema.safeParse(raw);
  if (!parsed.success) return null;
  const topics = parsed.data.topics.filter((t) => CHANNEL_SET.has(t));
  return { topics, entities: parsed.data.entities, summary: parsed.data.summary };
}

async function enrichOne(item: FeedItem, client: LlmClient): Promise<FeedItem> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const text = await client.complete(buildEnrichPrompt(item));
      const parsed = parseEnrichResponse(text);
      if (!parsed) break; // garbage output: do not retry, keep seeded
      const topics = [...new Set([...item.topics, ...parsed.topics])];
      return { ...item, topics, entities: parsed.entities, summary: parsed.summary };
    } catch {
      // fall through to retry / give up
    }
  }
  return { ...item }; // keep seeded topics + empty summary/entities
}

export async function enrichItems(
  items: FeedItem[],
  client: LlmClient | null,
  opts: { concurrency?: number } = {},
): Promise<FeedItem[]> {
  if (client === null) return items.map((it) => ({ ...it }));
  const nonNullClient: LlmClient = client;
  const concurrency = opts.concurrency ?? 4;
  const out: FeedItem[] = new Array<FeedItem>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      out[i] = await enrichOne(items[i]!, nonNullClient);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return out;
}
