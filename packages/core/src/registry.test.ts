import { expect, test } from "vitest";
import { parseRegistry } from "./registry.js";

test("parseRegistry applies defaults and validates", () => {
  const reg = parseRegistry({
    version: 1,
    sources: [{ id: "hn", type: "hn", url: "https://news.ycombinator.com", channels: ["tech"] }],
  });
  const hn = reg.sources[0]!;
  expect(hn.enabled).toBe(true);
  expect(hn.trustScore).toBe(0.5);
  expect(hn.addedBy).toBe("seed");
  expect(hn.failureCount).toBe(0);
});

test("parseRegistry rejects an unknown source type", () => {
  expect(() =>
    parseRegistry({ version: 1, sources: [{ id: "x", type: "bogus", url: "https://e.com", channels: [] }] }),
  ).toThrow();
});

test("legacy entries with no health/lifecycle fields validate unchanged", () => {
  // Backward-compat with the 682 live entries: no status/consecutiveFailures/etc.
  const reg = parseRegistry({
    version: 1,
    sources: [{ id: "hn", type: "hn", url: "https://news.ycombinator.com", channels: ["tech"] }],
  });
  const hn = reg.sources[0]!;
  expect(hn.status).toBeUndefined();
  expect(hn.consecutiveFailures).toBeUndefined();
  expect(hn.lastOkAt).toBeUndefined();
  expect(hn.lastError).toBeUndefined();
  expect(hn.resolvedUrl).toBeUndefined();
  expect(hn.disabledAt).toBeUndefined();
});

test("legacy DISABLED entry with no disabledAt still parses (backward-compat for the re-probe field)", () => {
  // Exactly the shape of the ~208 youtube sources already killed by the
  // videos.xml discovery outage before `disabledAt` existed.
  const reg = parseRegistry({
    version: 1,
    sources: [
      {
        id: "yt-dead",
        type: "youtube",
        url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCxxxxxxxxxxxxxxxxxxxxxx",
        channels: ["tech"],
        enabled: false,
        status: "disabled",
        consecutiveFailures: 3,
      },
    ],
  });
  const s = reg.sources[0]!;
  expect(s.enabled).toBe(false);
  expect(s.status).toBe("disabled");
  expect(s.disabledAt).toBeUndefined();
});

test("parseRegistry accepts and round-trips the new health/lifecycle fields", () => {
  const reg = parseRegistry({
    version: 1,
    sources: [
      {
        id: "dead",
        type: "rss",
        url: "https://e.com/feed",
        channels: ["tech"],
        status: "disabled",
        consecutiveFailures: 3,
        lastOkAt: "2026-06-01T00:00:00.000Z",
        lastError: { kind: "permanent", code: 404, at: "2026-06-30T00:00:00.000Z" },
        resolvedUrl: "https://e.com/new-feed.xml",
        disabledAt: "2026-06-30T00:00:00.000Z",
      },
    ],
  });
  const s = reg.sources[0]!;
  expect(s.status).toBe("disabled");
  expect(s.consecutiveFailures).toBe(3);
  expect(s.lastOkAt).toBe("2026-06-01T00:00:00.000Z");
  expect(s.lastError).toEqual({ kind: "permanent", code: 404, at: "2026-06-30T00:00:00.000Z" });
  expect(s.resolvedUrl).toBe("https://e.com/new-feed.xml");
  expect(s.disabledAt).toBe("2026-06-30T00:00:00.000Z");
});

test("parseRegistry rejects an unknown status value", () => {
  expect(() =>
    parseRegistry({
      version: 1,
      sources: [{ id: "x", type: "rss", url: "https://e.com", channels: [], status: "bogus" }],
    }),
  ).toThrow();
});
