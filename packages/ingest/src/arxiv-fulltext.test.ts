import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
// Mirror fetches are gated by a per-host min-gap (1s default); zero it so the
// unit suite is fast and deterministic. Read at module load by the limiter.
process.env["ARXIV_HOST_MIN_GAP_MS"] = "0";
import { arxivId, arxivHtmlUrls, fetchArxivFullText } from "./arxiv-fulltext.js";
import type { FetchFn } from "./fetchers/build-source.js";
import { htmlToText } from "./extract.js";

const AR5IV_HTML = readFileSync(
  fileURLToPath(new URL("./__fixtures__/ar5iv-sample.html", import.meta.url)),
  "utf8",
);

// ---------------------------------------------------------------------------
// arxivId — robust bare-id extraction
// ---------------------------------------------------------------------------

describe("arxivId", () => {
  test("extracts a modern id from an abs URL", () => {
    expect(arxivId("https://arxiv.org/abs/2501.01234")).toBe("2501.01234");
  });

  test("strips a version suffix", () => {
    expect(arxivId("https://arxiv.org/abs/2501.01234v2")).toBe("2501.01234");
    expect(arxivId("https://arxiv.org/abs/2501.01234v13")).toBe("2501.01234");
  });

  test("handles http and a trailing slash", () => {
    expect(arxivId("http://arxiv.org/abs/2501.01234/")).toBe("2501.01234");
  });

  test("handles the pdf form (with and without .pdf)", () => {
    expect(arxivId("https://arxiv.org/pdf/2501.01234")).toBe("2501.01234");
    expect(arxivId("https://arxiv.org/pdf/2501.01234.pdf")).toBe("2501.01234");
    expect(arxivId("https://arxiv.org/pdf/2501.01234v2.pdf")).toBe("2501.01234");
  });

  test("handles the rss.arxiv.org GUID form (oai:arXiv.org:<id>)", () => {
    expect(arxivId("oai:arXiv.org:2501.01234")).toBe("2501.01234");
    expect(arxivId("https://rss.arxiv.org/abs/2501.01234")).toBe("2501.01234");
  });

  test("handles old-style ids with a category prefix", () => {
    expect(arxivId("https://arxiv.org/abs/hep-th/9901001")).toBe("hep-th/9901001");
    expect(arxivId("https://arxiv.org/abs/hep-th/9901001v2")).toBe("hep-th/9901001");
    expect(arxivId("oai:arXiv.org:hep-th/9901001")).toBe("hep-th/9901001");
  });

  test("returns null for a non-arXiv url", () => {
    expect(arxivId("https://example.com/blog/post")).toBeNull();
    expect(arxivId("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// arxivHtmlUrls — ordered mirror list
// ---------------------------------------------------------------------------

describe("arxivHtmlUrls", () => {
  test("derives the ar5iv + arxiv-html mirror chain for a modern id", () => {
    const urls = arxivHtmlUrls("https://arxiv.org/abs/2501.01234v2");
    // ar5iv first (clean HTML), arxiv native html as fallback.
    expect(urls[0]).toContain("ar5iv");
    expect(urls.some((u) => u.includes("2501.01234"))).toBe(true);
    expect(urls.some((u) => u.includes("arxiv.org/html/2501.01234"))).toBe(true);
    // Version suffix is dropped in the derived urls.
    expect(urls.every((u) => !u.includes("v2"))).toBe(true);
  });

  test("works for old-style ids", () => {
    const urls = arxivHtmlUrls("https://arxiv.org/abs/hep-th/9901001");
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => u.includes("hep-th/9901001"))).toBe(true);
  });

  test("returns an empty list for a non-arXiv url", () => {
    expect(arxivHtmlUrls("https://example.com/x")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// fetchArxivFullText — fetch a mirror, extract, clear the 5-min floor
// ---------------------------------------------------------------------------

function makeItem(url: string, body: string) {
  return {
    id: "a1",
    source: "arxiv-cs-ai",
    sourceType: "arxiv" as const,
    url,
    title: "Scaling Sparse MoE",
    publishedAt: "2026-06-23T00:00:00.000Z",
    fetchedAt: "2026-06-23T00:00:00.000Z",
    topics: [],
    entities: [],
    summary: body,
    body,
    media: [],
    kind: "paper" as const,
  };
}

const ABSTRACT_BODY =
  "We study how sparse mixture-of-experts routing interacts with long context windows. " +
  "We introduce a routing regularizer that stabilizes expert load.";

describe("fetchArxivFullText", () => {
  test("pulls full paper text from the ar5iv mirror, far longer than the abstract", async () => {
    const item = makeItem("https://arxiv.org/abs/2501.01234", ABSTRACT_BODY);
    const seen: string[] = [];
    const fetchFn: FetchFn = async (url) => {
      seen.push(url);
      if (url.includes("ar5iv")) {
        return { ok: true, status: 200, text: async () => AR5IV_HTML, json: async () => ({}) };
      }
      return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
    };

    const result = await fetchArxivFullText(item, fetchFn);
    expect(result).not.toBeNull();
    const text = result!.article.text;
    // The ar5iv mirror was the one consulted first.
    expect(seen[0]).toContain("ar5iv");
    // Full body is dramatically longer than the abstract.
    expect(text.length).toBeGreaterThan(ABSTRACT_BODY.length * 5);
    // And it clears a 5-minute read (~1100+ words at ~220 wpm).
    const words = text.split(/\s+/).filter(Boolean).length;
    expect(words).toBeGreaterThan(1100);
    // Real paper prose made it through.
    expect(result!.article.html).toContain("depth-decorrelated");
  });

  test("falls through to arxiv native html when ar5iv fails", async () => {
    const item = makeItem("https://arxiv.org/abs/2501.01234", ABSTRACT_BODY);
    const seen: string[] = [];
    const fetchFn: FetchFn = async (url) => {
      seen.push(url);
      if (url.includes("ar5iv")) {
        return { ok: false, status: 503, text: async () => "", json: async () => ({}) };
      }
      if (url.includes("arxiv.org/html/")) {
        return { ok: true, status: 200, text: async () => AR5IV_HTML, json: async () => ({}) };
      }
      return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
    };

    const result = await fetchArxivFullText(item, fetchFn);
    expect(result).not.toBeNull();
    expect(seen.some((u) => u.includes("ar5iv"))).toBe(true);
    expect(seen.some((u) => u.includes("arxiv.org/html/"))).toBe(true);
    expect(htmlToText(result!.article.html).length).toBeGreaterThan(ABSTRACT_BODY.length * 5);
  });

  test("returns null and never throws when every mirror fails", async () => {
    const item = makeItem("https://arxiv.org/abs/2501.01234", ABSTRACT_BODY);
    const fetchFn: FetchFn = async () => {
      throw new Error("network down");
    };
    await expect(fetchArxivFullText(item, fetchFn)).resolves.toBeNull();
  });

  test("returns null for a non-arXiv url without fetching", async () => {
    const item = makeItem("https://example.com/blog", ABSTRACT_BODY);
    let calls = 0;
    const fetchFn: FetchFn = async () => {
      calls++;
      return { ok: true, status: 200, text: async () => AR5IV_HTML, json: async () => ({}) };
    };
    expect(await fetchArxivFullText(item, fetchFn)).toBeNull();
    expect(calls).toBe(0);
  });
});
