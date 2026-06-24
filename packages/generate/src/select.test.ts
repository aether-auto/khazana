import { expect, test } from "vitest";
import type { FeedItem } from "@khazana/core";
import type { TastePayload } from "@khazana/curate";
import { dueColumns, selectAssignments, slugify } from "./select.js";

const NOT_READY: TastePayload = { ready: false, topics: {}, entities: {}, formatAffinity: {} };

function item(id: string, clusterId: string, channel: string, taste: number, publishedAt: string): FeedItem {
  return {
    id,
    source: "src",
    sourceType: "rss",
    url: `https://e.com/${id}`,
    title: `Item ${id}`,
    publishedAt,
    fetchedAt: publishedAt,
    topics: [channel],
    entities: [],
    summary: `summary ${id}`,
    media: [],
    clusterId,
    tasteScore: taste,
    kind: "link",
  };
}

test("dueColumns returns the chronicle column on a Sunday (UTC)", () => {
  // 2026-06-21 is a Sunday.
  const cols = dueColumns("2026-06-21T12:00:00.000Z");
  expect(cols).toContainEqual({ format: "chronicle", channel: "history" });
  // 2026-06-23 is a Tuesday → no weekly Sunday column.
  expect(dueColumns("2026-06-23T12:00:00.000Z")).not.toContainEqual({ format: "chronicle", channel: "history" });
});

test("slugify is deterministic and stable for the same inputs", () => {
  const a = slugify("OpenAI ships GPT-5!", ["x", "y"]);
  const b = slugify("OpenAI ships GPT-5!", ["x", "y"]);
  expect(a).toBe(b);
  expect(a).toMatch(/^openai-ships-gpt-5-[0-9a-f]{6}$/);
  // different sources → different hash suffix
  expect(slugify("OpenAI ships GPT-5!", ["z"])).not.toBe(a);
});

test("selectAssignments ranks clusters and caps at maxPerRun, no columns due", () => {
  const items: FeedItem[] = [
    // cluster A: big + high taste (ai → dispatch/field-notes/teardown/primer candidates)
    item("a1", "A", "ai", 9, "2026-06-23T00:00:00.000Z"),
    item("a2", "A", "ai", 8, "2026-06-23T00:00:00.000Z"),
    // cluster B: medium
    item("b1", "B", "finance", 5, "2026-06-22T00:00:00.000Z"),
    // cluster C: small/low
    item("c1", "C", "science", 1, "2026-06-20T00:00:00.000Z"),
  ];
  const out = selectAssignments({ items, taste: NOT_READY, now: "2026-06-23T12:00:00.000Z", maxPerRun: 2 });
  expect(out).toHaveLength(2);
  // top assignment is cluster A
  expect(out[0]!.sourceItemIds).toEqual(["a1", "a2"]);
  expect(out[0]!.channel).toBe("ai");
  // every assignment carries a known format and a slug
  for (const a of out) {
    expect(a.slug).toMatch(/^[a-z0-9-]+$/);
    expect(a.sourceItemIds.length).toBeGreaterThan(0);
  }
});

test("formatAffinity biases the format choice among candidates when taste is ready", () => {
  const items: FeedItem[] = [item("a1", "A", "ai", 9, "2026-06-23T00:00:00.000Z")];
  // ai-channel candidate formats include dispatch, field-notes, teardown, primer.
  // Bias strongly toward teardown.
  const taste: TastePayload = {
    ready: true,
    topics: { ai: 1 },
    entities: {},
    formatAffinity: { teardown: 1, dispatch: 0.1 },
  };
  const out = selectAssignments({ items, taste, now: "2026-06-23T12:00:00.000Z", maxPerRun: 1 });
  expect(out[0]!.format).toBe("teardown");
});

test("a due column is always included and counts toward the run", () => {
  const items: FeedItem[] = [item("a1", "A", "ai", 9, "2026-06-23T00:00:00.000Z")];
  const out = selectAssignments({
    items,
    taste: NOT_READY,
    now: "2026-06-23T12:00:00.000Z",
    maxPerRun: 2,
    dueColumns: [{ format: "chronicle", channel: "history" }],
  });
  const column = out.find((a) => a.column);
  expect(column).toBeDefined();
  expect(column!.format).toBe("chronicle");
  expect(out.length).toBeLessThanOrEqual(2);
});
