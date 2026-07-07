// bento-balance.test.ts — TDD: failing tests written BEFORE implementing the
// channel-balanced hero bento selector (`selectBalancedBento`).
//
// Ground truth this defends against: the curated feed is ~337 items and the
// bento used to be chosen by PURE global rank, so a high-volume channel
// (tech/ai) could fill nearly the whole hero while a healthy-sized but
// lower-scoring channel (history, ~20% of the corpus) never cracked the top
// N and got relegated entirely to the below-the-fold "browse by topic" rails.
import { expect, test } from "vitest";
import type { FeedItem } from "@khazana/core";
import { selectBalancedBento, BENTO_CHANNEL_CAP_RATIO } from "./feed.js";

const item = (over: Partial<FeedItem> & { body?: string }): FeedItem => ({
  id: "id1",
  source: "s",
  sourceType: "rss",
  url: "https://e.com/a",
  title: "A",
  publishedAt: "2026-06-20T00:00:00.000Z",
  fetchedAt: "2026-06-23T00:00:00.000Z",
  topics: ["tech"],
  entities: [],
  summary: "",
  media: [],
  kind: "link",
  ...over,
});

// Body long enough to clear the ≥7-min FEATURE_MIN_MINUTES gate (225 wpm).
function bodyOfMinutes(minutes: number): string {
  const words = Math.ceil(minutes * 225);
  return "<p>" + Array.from({ length: words }, (_, i) => `word${i}`).join(" ") + "</p>";
}
const eligibleBody = bodyOfMinutes(9);
const shortBody = bodyOfMinutes(3); // fails the ≥7-min gate

function primaryChannelCounts(bento: FeedItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const it of bento) {
    const ch = it.topics[0] ?? "none";
    counts[ch] = (counts[ch] ?? 0) + 1;
  }
  return counts;
}

test("selectBalancedBento surfaces an under-represented channel into the hero", () => {
  // 40 dominant tech items (rank 0..39) rank strictly ahead of 10 history +
  // 10 geopolitics + 10 geography items — pure top-10 rank would include
  // ZERO non-tech items.
  const tech = Array.from({ length: 40 }, (_, i) =>
    item({ id: `tech${i}`, topics: ["tech"], body: eligibleBody }),
  );
  const history = Array.from({ length: 10 }, (_, i) =>
    item({ id: `hist${i}`, topics: ["history"], body: eligibleBody }),
  );
  const geopolitics = Array.from({ length: 10 }, (_, i) =>
    item({ id: `geo${i}`, topics: ["geopolitics"], body: eligibleBody }),
  );
  const geography = Array.from({ length: 10 }, (_, i) =>
    item({ id: `ggr${i}`, topics: ["geography"], body: eligibleBody }),
  );
  const all = [...tech, ...history, ...geopolitics, ...geography];

  const bento = selectBalancedBento(all, 10);
  expect(bento).toHaveLength(10);
  expect(bento.some((it) => it.topics[0] === "history")).toBe(true);
});

test("selectBalancedBento never lets a single channel exceed the cap", () => {
  const count = 10;
  const cap = Math.max(1, Math.round(count * BENTO_CHANNEL_CAP_RATIO));

  const tech = Array.from({ length: 40 }, (_, i) =>
    item({ id: `tech${i}`, topics: ["tech"], body: eligibleBody }),
  );
  const history = Array.from({ length: 10 }, (_, i) =>
    item({ id: `hist${i}`, topics: ["history"], body: eligibleBody }),
  );
  const geopolitics = Array.from({ length: 10 }, (_, i) =>
    item({ id: `geo${i}`, topics: ["geopolitics"], body: eligibleBody }),
  );
  const geography = Array.from({ length: 10 }, (_, i) =>
    item({ id: `ggr${i}`, topics: ["geography"], body: eligibleBody }),
  );
  const all = [...tech, ...history, ...geopolitics, ...geography];

  const bento = selectBalancedBento(all, count);
  const counts = primaryChannelCounts(bento);
  for (const [, n] of Object.entries(counts)) {
    expect(n).toBeLessThanOrEqual(cap);
  }
});

test("selectBalancedBento never promotes an ineligible (sub-gate) item for diversity's sake", () => {
  // Only 1 tech item clears the gate; the rest are short. A single short
  // history item must NOT be promoted just because history is scarce.
  const tech = item({ id: "tech-long", topics: ["tech"], body: eligibleBody });
  const shortHistory = item({ id: "hist-short", topics: ["history"], body: shortBody });
  const shortTech = Array.from({ length: 5 }, (_, i) =>
    item({ id: `tech-short${i}`, topics: ["tech"], body: shortBody }),
  );

  const bento = selectBalancedBento([tech, shortHistory, ...shortTech], 10);
  expect(bento.map((it) => it.id)).toEqual(["tech-long"]);
});

test("selectBalancedBento is deterministic — same input, same output", () => {
  const tech = Array.from({ length: 20 }, (_, i) =>
    item({ id: `tech${i}`, topics: ["tech"], body: eligibleBody }),
  );
  const history = Array.from({ length: 8 }, (_, i) =>
    item({ id: `hist${i}`, topics: ["history"], body: eligibleBody }),
  );
  const all = [...tech, ...history];

  const first = selectBalancedBento(all, 12).map((it) => it.id);
  const second = selectBalancedBento(all, 12).map((it) => it.id);
  expect(first).toEqual(second);
});

test("selectBalancedBento honors the requested count when enough eligible items exist", () => {
  const tech = Array.from({ length: 20 }, (_, i) =>
    item({ id: `tech${i}`, topics: ["tech"], body: eligibleBody }),
  );
  const history = Array.from({ length: 8 }, (_, i) =>
    item({ id: `hist${i}`, topics: ["history"], body: eligibleBody }),
  );
  const all = [...tech, ...history];
  expect(selectBalancedBento(all, 15)).toHaveLength(15);
});

test("selectBalancedBento degrades gracefully when only one channel exists", () => {
  const tech = Array.from({ length: 15 }, (_, i) =>
    item({ id: `tech${i}`, topics: ["tech"], body: eligibleBody }),
  );
  const bento = selectBalancedBento(tech, 10);
  expect(bento).toHaveLength(10);
  expect(bento.every((it) => it.topics[0] === "tech")).toBe(true);
  // Still the top-ranked items by rank order (no gaps skipped for no reason).
  expect(bento.map((it) => it.id)).toEqual(tech.slice(0, 10).map((it) => it.id));
});

test("selectBalancedBento returns fewer than count when too few eligible items exist", () => {
  const long = item({ id: "long1", topics: ["tech"], body: eligibleBody });
  const short = item({ id: "short1", topics: ["tech"], body: shortBody });
  expect(selectBalancedBento([long, short], 10).map((it) => it.id)).toEqual(["long1"]);
});

test("selectBalancedBento returns an empty bento for an empty/all-ineligible feed", () => {
  expect(selectBalancedBento([], 10)).toEqual([]);
  const allShort = [item({ id: "s1", body: shortBody }), item({ id: "s2", body: shortBody })];
  expect(selectBalancedBento(allShort, 10)).toEqual([]);
});

test("selectBalancedBento keeps the single top-ranked eligible item as the hero feature (index 0)", () => {
  const top = item({ id: "top-tech", topics: ["tech"], body: eligibleBody });
  const rest = Array.from({ length: 10 }, (_, i) =>
    item({ id: `hist${i}`, topics: ["history"], body: eligibleBody }),
  );
  const bento = selectBalancedBento([top, ...rest], 8);
  expect(bento[0]!.id).toBe("top-tech");
});

test("selectBalancedBento picks by rank WITHIN a channel — only cross-channel interleaving changes", () => {
  // history items are ranked h0 (best) .. h7 (worst) by position. With only 2
  // hero slots reachable for history under the cap, it must be the TOP two,
  // not an arbitrary pair.
  const tech = Array.from({ length: 20 }, (_, i) =>
    item({ id: `tech${i}`, topics: ["tech"], body: eligibleBody }),
  );
  const history = Array.from({ length: 8 }, (_, i) =>
    item({ id: `h${i}`, topics: ["history"], body: eligibleBody }),
  );
  const all = [...tech, ...history];
  const bento = selectBalancedBento(all, 10);
  const historyIds = bento.filter((it) => it.topics[0] === "history").map((it) => it.id);
  // Whatever count of history items got in, they must be a PREFIX of h0..h7
  // (best-ranked first), never skipping a better-ranked one for a worse one.
  expect(historyIds).toEqual(history.slice(0, historyIds.length).map((it) => it.id));
});

test("selectBalancedBento: a precomputed readMinutesOf accessor yields the same result as the default parser", () => {
  const items = [
    item({ id: "long1", topics: ["tech"], body: eligibleBody }),
    item({ id: "hist-long", topics: ["history"], body: eligibleBody }),
    item({ id: "short1", topics: ["tech"], body: shortBody }),
  ];
  const readMinutesById = new Map(
    items.map((it) => [
      it.id,
      it.body ? Math.round(it.body.replace(/<[^>]*>/g, " ").trim().split(/\s+/).length / 225) : 0,
    ]),
  );
  const readMinutesOf = (it: FeedItem) => readMinutesById.get(it.id) ?? 0;

  const withAccessor = selectBalancedBento(items, 5, readMinutesOf).map((it) => it.id);
  const withDefault = selectBalancedBento(items, 5).map((it) => it.id);
  expect(withAccessor).toEqual(withDefault);
});
