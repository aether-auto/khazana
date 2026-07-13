import { expect, test } from "vitest";
import { containsUnsafeMarkup, type FeedItem } from "@khazana/core";
import { sanitizePlainSummary, sanitizeFeedItemContent } from "./extract.js";

const base: FeedItem = {
  id: "id0",
  source: "src0",
  sourceType: "rss",
  url: "https://example.com/a",
  title: "T",
  publishedAt: "2026-06-20T00:00:00.000Z",
  fetchedAt: "2026-06-23T00:00:00.000Z",
  topics: [],
  entities: [],
  summary: "",
  media: [],
  kind: "link",
};

test("sanitizePlainSummary strips ALL tags down to plain text", () => {
  expect(sanitizePlainSummary("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
  expect(sanitizePlainSummary("plain text")).toBe("plain text");
});

test("sanitizePlainSummary drops dangerous markup and its content", () => {
  const out = sanitizePlainSummary('<script>alert(1)</script>after');
  expect(out).not.toMatch(/<script/i);
  expect(containsUnsafeMarkup(out)).toBe(false);
  expect(sanitizePlainSummary('<img src=x onerror="steal()">caption')).toBe("caption");
});

// Regression: real bad item found committed in data/feed for source julia-evans-blog.
test("regression: julia-evans <figure><img> leaked into summary is stripped clean", () => {
  const bad = '<figure class="zine horizontal"><img src="whatever.jpg"></figure>';
  const cleaned = sanitizePlainSummary(bad);
  expect(cleaned).not.toMatch(/<figure/i);
  expect(cleaned).not.toMatch(/<img/i);
  expect(containsUnsafeMarkup(cleaned)).toBe(false);
});

test("sanitizeFeedItemContent: summary becomes plain text, body becomes allowlisted HTML", () => {
  const item: FeedItem = {
    ...base,
    summary: '<figure class="zine"><img src="x.jpg"></figure>Some excerpt',
    body: '<p>Real prose that is long enough to survive boilerplate stripping and remain as body content for the reader.</p><script>alert(1)</script>',
  };
  const out = sanitizeFeedItemContent(item);
  expect(out.summary).toBe("Some excerpt");
  expect(out.body).toBeDefined();
  expect(out.body!).toMatch(/Real prose/);
  expect(out.body!).not.toMatch(/<script/i);
  expect(containsUnsafeMarkup(out.summary)).toBe(false);
  expect(containsUnsafeMarkup(out.body ?? "")).toBe(false);
});

// EXTRACT=0 path: body was never enriched, still the raw RSS snippet — must be sanitized anyway.
test("sanitizeFeedItemContent sanitizes body even when enrichment never ran", () => {
  const item: FeedItem = {
    ...base,
    sourceType: "reddit",
    summary: "",
    body: 'raw selftext <iframe src="evil"></iframe> and <a href="javascript:x()">bad link</a>',
  };
  const out = sanitizeFeedItemContent(item);
  expect(out.body ?? "").not.toMatch(/<iframe/i);
  expect(out.body ?? "").not.toMatch(/javascript:/i);
  expect(containsUnsafeMarkup(out.body ?? "")).toBe(false);
});

test("sanitizeFeedItemContent leaves an empty/undefined body undefined", () => {
  const out = sanitizeFeedItemContent({ ...base, summary: "x", body: undefined });
  expect(out.body).toBeUndefined();
  const out2 = sanitizeFeedItemContent({ ...base, summary: "x", body: "   " });
  expect(out2.body).toBeUndefined();
});
