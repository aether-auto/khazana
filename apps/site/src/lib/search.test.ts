import { expect, test } from "vitest";
import { mapPagefindResult, type RawPagefindResult } from "./search.js";

// Fixture shaped like a resolved Pagefind `result.data()` payload.
const fixture: RawPagefindResult = {
  url: "/khazana/reads/the-week-in-silicon/",
  meta: { title: "The Week in Silicon" },
  excerpt: "Inference at the <mark>edge</mark> is getting cheap.",
};

test("maps url/title/excerpt straight through", () => {
  expect(mapPagefindResult(fixture)).toEqual({
    url: "/khazana/reads/the-week-in-silicon/",
    title: "The Week in Silicon",
    excerpt: "Inference at the <mark>edge</mark> is getting cheap.",
  });
});

test("falls back to url-derived title when meta.title is missing", () => {
  const r = mapPagefindResult({ url: "/khazana/workshop/", meta: {}, excerpt: "" });
  expect(r.title).toBe("workshop");
});

test("uses '/' page title 'home' and tolerates trailing slash", () => {
  expect(mapPagefindResult({ url: "/khazana/", meta: {}, excerpt: "" }).title).toBe("home");
});

test("strips a trailing slash and base when deriving a title from a deep url", () => {
  const r = mapPagefindResult({ url: "/reads/the-shape-of-a-hash/", meta: {}, excerpt: "x" });
  expect(r.title).toBe("the-shape-of-a-hash");
});

test("never throws and yields strings on a malformed result", () => {
  const r = mapPagefindResult({ url: "", meta: undefined, excerpt: undefined } as unknown as RawPagefindResult);
  expect(typeof r.title).toBe("string");
  expect(typeof r.excerpt).toBe("string");
  expect(typeof r.url).toBe("string");
});
