import { describe, expect, test } from "vitest";
import { dedupeItems, normalizeTitle } from "./dedupe.js";
import type { FeedItem } from "./feed-item.js";

/** Build a plain-text body of roughly `chars` characters. */
function bodyOfLength(chars: number): string {
  return "x".repeat(Math.max(0, chars));
}

function makeItem(overrides: Partial<FeedItem> & Pick<FeedItem, "id">): FeedItem {
  return {
    id: overrides.id,
    source: overrides.source ?? "src",
    sourceType: overrides.sourceType ?? "rss",
    url: overrides.url ?? `https://e.com/${overrides.id}`,
    title: overrides.title ?? "A title",
    author: overrides.author,
    publishedAt: overrides.publishedAt ?? "2026-06-22T00:00:00.000Z",
    fetchedAt: overrides.fetchedAt ?? "2026-06-23T00:00:00.000Z",
    topics: overrides.topics ?? [],
    entities: overrides.entities ?? [],
    summary: overrides.summary ?? "",
    body: overrides.body,
    media: overrides.media ?? [],
    metrics: overrides.metrics,
    clusterId: overrides.clusterId,
    tasteScore: overrides.tasteScore,
    trustScore: overrides.trustScore,
    kind: overrides.kind ?? "link",
  };
}

describe("normalizeTitle", () => {
  test("lowercases, strips punctuation, collapses whitespace, trims", () => {
    expect(normalizeTitle("  Import AI #462: The Future! ")).toBe("import ai 462 the future");
  });

  test("identical-meaning titles with different punctuation normalize equal", () => {
    expect(normalizeTitle("What Is the Positive Grassmannian?")).toBe(
      normalizeTitle("What is the Positive Grassmannian"),
    );
  });

  test("blank or punctuation-only titles normalize to empty string", () => {
    expect(normalizeTitle("   ")).toBe("");
    expect(normalizeTitle("!!! ---")).toBe("");
  });
});

describe("dedupeItems", () => {
  test("empty input → empty output", () => {
    expect(dedupeItems([])).toEqual([]);
  });

  test("collapses Import AI 462 mirror pair (importai vs jack-clark) to one", () => {
    const items = [
      makeItem({
        id: "a",
        source: "import-ai",
        url: "https://importai.substack.com/p/462",
        title: "Import AI 462: Robots; scaling; safety",
        publishedAt: "2026-06-20T12:00:00.000Z",
        body: bodyOfLength(2000),
      }),
      makeItem({
        id: "b",
        source: "jack-clark-import-ai-substack",
        url: "https://jack-clark.net/2026/06/20/import-ai-462",
        title: "Import AI 462: Robots; scaling; safety",
        publishedAt: "2026-06-20T12:00:00.000Z",
        body: bodyOfLength(500),
      }),
    ];
    const out = dedupeItems(items);
    expect(out).toHaveLength(1);
    // Representative is the better-extracted (longer full-text) item "a".
    expect(out[0]!.id).toBe("a");
  });

  test("collapses Import AI 461 mirror pair to one", () => {
    const items = [
      makeItem({
        id: "x461",
        source: "import-ai",
        title: "Import AI 461: Agents and evals",
        publishedAt: "2026-06-13T12:00:00.000Z",
        body: bodyOfLength(2000),
      }),
      makeItem({
        id: "y461",
        source: "jack-clark-import-ai-substack",
        title: "Import AI 461: Agents and evals",
        publishedAt: "2026-06-13T12:00:00.000Z",
        body: bodyOfLength(2000),
      }),
    ];
    expect(dedupeItems(items)).toHaveLength(1);
  });

  test("collapses Positive Grassmannian quanta double-registration to one", () => {
    const items = [
      makeItem({
        id: "q1",
        source: "news-quanta-magazine",
        title: "What Is the Positive Grassmannian?",
        publishedAt: "2026-06-25T09:00:00.000Z",
      }),
      makeItem({
        id: "q2",
        source: "quanta-magazine",
        title: "What Is the Positive Grassmannian?",
        publishedAt: "2026-06-25T09:00:00.000Z",
      }),
    ];
    expect(dedupeItems(items)).toHaveLength(1);
  });

  test("representative selection prefers full text, then longer body", () => {
    const items = [
      makeItem({ id: "short", title: "Same Story", body: bodyOfLength(500) }),
      makeItem({ id: "full", title: "Same Story", body: bodyOfLength(2000) }),
    ];
    const out = dedupeItems(items);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("full");
  });

  test("merges topics and entities (deduped, order-preserved) and maxes metrics", () => {
    const items = [
      makeItem({
        id: "rep",
        title: "Merge Me",
        body: bodyOfLength(2000),
        topics: ["ai", "tech"],
        entities: ["OpenAI"],
        metrics: { score: 10, comments: 2 },
      }),
      makeItem({
        id: "dropped",
        title: "Merge Me",
        body: bodyOfLength(500),
        topics: ["tech", "science"],
        entities: ["OpenAI", "DeepMind"],
        metrics: { score: 4, comments: 9 },
      }),
    ];
    const out = dedupeItems(items);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("rep");
    expect(out[0]!.topics).toEqual(["ai", "tech", "science"]);
    expect(out[0]!.entities).toEqual(["OpenAI", "DeepMind"]);
    expect(out[0]!.metrics).toEqual({ score: 10, comments: 9 });
  });

  test("is deterministic regardless of input order", () => {
    const a = makeItem({ id: "a", title: "Same Story", body: bodyOfLength(2000), topics: ["x"] });
    const b = makeItem({ id: "b", title: "Same Story", body: bodyOfLength(500), topics: ["y"] });
    const c = makeItem({ id: "c", title: "Same Story", body: bodyOfLength(2000), topics: ["z"] });
    const forward = dedupeItems([a, b, c]);
    const reverse = dedupeItems([c, b, a]);
    expect(forward).toHaveLength(1);
    expect(reverse).toHaveLength(1);
    expect(forward[0]!.id).toBe(reverse[0]!.id);
    // tie between a and c (both full text, equal length) → lexicographically smallest id wins.
    expect(forward[0]!.id).toBe("a");
  });

  test("does not collapse items with different titles", () => {
    const items = [
      makeItem({ id: "a", title: "Story One", publishedAt: "2026-06-20T00:00:00.000Z" }),
      makeItem({ id: "b", title: "Story Two", publishedAt: "2026-06-20T00:00:00.000Z" }),
    ];
    expect(dedupeItems(items)).toHaveLength(2);
  });

  test("does not collapse same title published far apart (outside window)", () => {
    const items = [
      makeItem({ id: "a", title: "Weekly Roundup", publishedAt: "2026-06-01T00:00:00.000Z" }),
      makeItem({ id: "b", title: "Weekly Roundup", publishedAt: "2026-06-20T00:00:00.000Z" }),
    ];
    expect(dedupeItems(items)).toHaveLength(2);
  });

  test("respects a custom windowHours option", () => {
    // 10 hours apart: collapsed under default 36h, kept under a 6h window.
    const items = [
      makeItem({ id: "a", title: "Same Story", publishedAt: "2026-06-20T00:00:00.000Z" }),
      makeItem({ id: "b", title: "Same Story", publishedAt: "2026-06-20T10:00:00.000Z" }),
    ];
    expect(dedupeItems(items)).toHaveLength(1);
    expect(dedupeItems(items, { windowHours: 6 })).toHaveLength(2);
  });

  test("never groups items with blank normalized titles", () => {
    const items = [
      makeItem({ id: "a", title: "   ", publishedAt: "2026-06-20T00:00:00.000Z" }),
      makeItem({ id: "b", title: "!!!", publishedAt: "2026-06-20T00:00:00.000Z" }),
    ];
    expect(dedupeItems(items)).toHaveLength(2);
  });

  test("collapses exact-URL duplicates even when titles differ slightly", () => {
    const items = [
      makeItem({
        id: "a",
        title: "OpenAI ships GPT-5",
        url: "https://example.com/gpt5",
        publishedAt: "2026-06-01T00:00:00.000Z",
        body: bodyOfLength(2000),
      }),
      makeItem({
        id: "b",
        title: "OpenAI ships GPT-5 (updated)",
        url: "https://example.com/gpt5",
        // far apart in time, but exact-URL match forces a collapse anyway.
        publishedAt: "2026-07-01T00:00:00.000Z",
        body: bodyOfLength(500),
      }),
    ];
    const out = dedupeItems(items);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("a");
  });

  test("does not mutate input items", () => {
    const rep = makeItem({ id: "rep", title: "Merge Me", body: bodyOfLength(2000), topics: ["ai"] });
    const dropped = makeItem({ id: "dropped", title: "Merge Me", body: bodyOfLength(500), topics: ["tech"] });
    dedupeItems([rep, dropped]);
    expect(rep.topics).toEqual(["ai"]);
  });

  test("preserves first-occurrence position of representatives", () => {
    const items = [
      makeItem({ id: "first", title: "Alpha", publishedAt: "2026-06-20T00:00:00.000Z" }),
      makeItem({ id: "dup1", title: "Beta", publishedAt: "2026-06-20T00:00:00.000Z", body: bodyOfLength(2000) }),
      makeItem({ id: "third", title: "Gamma", publishedAt: "2026-06-20T00:00:00.000Z" }),
      makeItem({ id: "dup2", title: "Beta", publishedAt: "2026-06-20T00:00:00.000Z", body: bodyOfLength(500) }),
    ];
    const out = dedupeItems(items);
    expect(out.map((it) => it.title)).toEqual(["Alpha", "Beta", "Gamma"]);
  });
});
