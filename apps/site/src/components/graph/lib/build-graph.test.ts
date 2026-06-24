import { expect, test } from "vitest";
import { buildGraph, type GraphItem, type GraphPost } from "./build-graph.js";

const items: GraphItem[] = [
  { id: "i1", title: "Edge tiers", topics: ["tech", "data-science"], entities: ["Netflix"], url: "https://a" },
  { id: "i2", title: "More edge", topics: ["tech", "data-science"], entities: ["Netflix"], url: "https://b" },
  { id: "i3", title: "Lone item", topics: ["finance"], entities: [], url: "https://c" },
];
const posts: GraphPost[] = [
  { slug: "silicon", title: "The Week in Silicon", channels: ["tech", "ai"] },
];

test("creates one node per item and post with stable ids and types", () => {
  const g = buildGraph(items, posts, { minShared: 2, maxNodes: 50 });
  expect(g.nodes.map((n) => n.id)).toEqual(["i1", "i2", "i3", "silicon"]);
  expect(g.nodes.find((n) => n.id === "silicon")?.type).toBe("post");
  expect(g.nodes.find((n) => n.id === "i1")?.type).toBe("item");
});

test("edges link nodes sharing >= minShared topics or entities; weight = shared count", () => {
  const g = buildGraph(items, posts, { minShared: 2, maxNodes: 50 });
  // i1<->i2 share topics tech+data-science (2) AND entity Netflix -> weight 3
  const e = g.edges.find((x) => x.source === "i1" && x.target === "i2");
  expect(e?.weight).toBe(3);
  // i1<->silicon share only 'tech' (1) -> below threshold, no edge
  expect(g.edges.find((x) => x.source === "i1" && x.target === "silicon")).toBeUndefined();
  // i3 shares nothing -> isolated
  expect(g.edges.some((x) => x.source === "i3" || x.target === "i3")).toBe(false);
});

test("edges are deterministic: sorted by [source,target], source<target", () => {
  const g = buildGraph(items, posts, { minShared: 2, maxNodes: 50 });
  const pairs = g.edges.map((e) => [e.source, e.target]);
  expect(pairs).toEqual([...pairs].sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1])));
  for (const e of g.edges) expect(e.source < e.target).toBe(true);
});

test("minShared=1 links the post via the shared 'tech' topic", () => {
  const g = buildGraph(items, posts, { minShared: 1, maxNodes: 50 });
  expect(g.edges.some((e) => e.source === "i1" && e.target === "silicon")).toBe(true);
});

test("maxNodes caps node count (keeps highest-degree nodes), edges pruned to survivors", () => {
  const g = buildGraph(items, posts, { minShared: 2, maxNodes: 2 });
  expect(g.nodes).toHaveLength(2);
  const ids = new Set(g.nodes.map((n) => n.id));
  // i1 & i2 are the connected pair -> highest degree -> kept; i3/silicon dropped
  expect(ids.has("i1") && ids.has("i2")).toBe(true);
  for (const e of g.edges) expect(ids.has(e.source) && ids.has(e.target)).toBe(true);
});

test("is a pure function: same inputs -> deeply equal output, no input mutation", () => {
  const a = buildGraph(items, posts, { minShared: 2, maxNodes: 50 });
  const b = buildGraph(items, posts, { minShared: 2, maxNodes: 50 });
  expect(a).toEqual(b);
  expect(items[0].topics).toEqual(["tech", "data-science"]);
});
