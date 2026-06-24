import { expect, test } from "vitest";
import { applyScout, inferType, makeSourceId } from "./apply.js";
import type { CandidateVerdict } from "./evaluate.js";
import type { Candidate } from "./io.js";
import type { Registry } from "@khazana/core";

const registry: Registry = { version: 1, sources: [] };

const verdict = (over: Partial<CandidateVerdict>): CandidateVerdict => ({
  decision: "add", trust: 0.8, feedUrl: "https://newblog.example.com/feed.xml",
  channels: ["ai"], duplicate: false, hasFeed: true, reason: "auto-add", ...over,
});
const cand = (url: string): Candidate => ({ url, title: "T", channels: ["ai"] });

const now = "2026-06-23T00:00:00.000Z";

test("inferType picks type by URL pattern, default rss", () => {
  expect(inferType("https://rss.arxiv.org/rss/cs.AI")).toBe("arxiv");
  expect(inferType("https://www.reddit.com/r/x/.json")).toBe("reddit");
  expect(inferType("https://netflixtechblog.com/blog/feed")).toBe("eng-blog");
  expect(inferType("https://quantamagazine.org/feed/")).toBe("rss");
});

test("makeSourceId is a stable slug, deduped against existing ids", () => {
  const reg: Registry = { version: 1, sources: [{ id: "newblog-example-com", type: "rss", url: "https://x", channels: [], enabled: true, trustScore: 0.5, addedBy: "seed", failureCount: 0 }] };
  expect(makeSourceId("https://newblog.example.com/feed.xml", reg)).toBe("newblog-example-com-2");
});

test("add appends a validated scout SourceEntry with defaults", () => {
  const { registry: reg, report } = applyScout(
    registry,
    [{ candidate: cand("https://newblog.example.com"), verdict: verdict({}) }],
    now,
  );
  expect(reg.sources).toHaveLength(1);
  const s = reg.sources[0]!;
  expect(s.url).toBe("https://newblog.example.com/feed.xml");
  expect(s.type).toBe("rss");
  expect(s.channels).toEqual(["ai"]);
  expect(s.enabled).toBe(true);
  expect(s.addedBy).toBe("scout");
  expect(s.addedAt).toBe(now);
  expect(s.trustScore).toBe(0.8);
  expect(report.added).toEqual([s.id]);
});

test("queue goes to pending, not the registry", () => {
  const { registry: reg, pending, report } = applyScout(
    registry,
    [{ candidate: cand("https://borderline.example.com"), verdict: verdict({ decision: "queue", trust: 0.5, reason: "queue-review", feedUrl: "https://borderline.example.com/feed" }) }],
    now,
  );
  expect(reg.sources).toHaveLength(0);
  expect(pending).toHaveLength(1);
  expect(pending[0]!.candidate.url).toBe("https://borderline.example.com");
  expect(report.queued).toEqual(["https://borderline.example.com"]);
});

test("reject is recorded with its reason, no registry change", () => {
  const { registry: reg, report } = applyScout(
    registry,
    [{ candidate: cand("https://dup.example.com"), verdict: verdict({ decision: "reject", reason: "duplicate" }) }],
    now,
  );
  expect(reg.sources).toHaveLength(0);
  expect(report.rejected).toEqual([{ url: "https://dup.example.com", reason: "duplicate" }]);
});

test("two adds on the same domain get distinct ids", () => {
  const { registry: reg } = applyScout(
    registry,
    [
      { candidate: cand("https://blog.example.com/a"), verdict: verdict({ feedUrl: "https://blog.example.com/a/feed.xml" }) },
      { candidate: cand("https://blog.example.com/b"), verdict: verdict({ feedUrl: "https://blog.example.com/b/feed.xml" }) },
    ],
    now,
  );
  const ids = reg.sources.map((s) => s.id);
  expect(new Set(ids).size).toBe(2);
});
