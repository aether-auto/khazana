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
