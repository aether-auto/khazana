import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  conditionalHeaders,
  extractValidators,
  conditionalFetch,
} from "./conditional.js";
import { makeCaches } from "./store.js";
import { urlKey } from "./keys.js";
import type { FetchResult } from "../fetchers/build-source.js";

describe("conditionalHeaders", () => {
  it("emits If-None-Match from a stored etag", () => {
    expect(
      conditionalHeaders({ url: "u", etag: '"abc"', fetchedAt: "t" }),
    ).toEqual({ "If-None-Match": '"abc"' });
  });
  it("emits If-Modified-Since from a stored last-modified", () => {
    expect(
      conditionalHeaders({ url: "u", lastModified: "Wed, 21 Oct 2015 07:28:00 GMT", fetchedAt: "t" }),
    ).toEqual({ "If-Modified-Since": "Wed, 21 Oct 2015 07:28:00 GMT" });
  });
  it("emits both when both are present", () => {
    const h = conditionalHeaders({ url: "u", etag: '"e"', lastModified: "LM", fetchedAt: "t" });
    expect(h["If-None-Match"]).toBe('"e"');
    expect(h["If-Modified-Since"]).toBe("LM");
  });
  it("emits nothing without validators", () => {
    expect(conditionalHeaders(undefined)).toEqual({});
    expect(conditionalHeaders({ url: "u", fetchedAt: "t" })).toEqual({});
  });
});

describe("extractValidators", () => {
  it("reads etag and last-modified case-insensitively", () => {
    const v = extractValidators({
      etag: '"xyz"',
      "Last-Modified": "Wed, 21 Oct 2015 07:28:00 GMT",
    });
    expect(v).toEqual({ etag: '"xyz"', lastModified: "Wed, 21 Oct 2015 07:28:00 GMT" });
  });
  it("returns empty when neither present", () => {
    expect(extractValidators({ "content-type": "text/xml" })).toEqual({});
    expect(extractValidators(undefined)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// conditionalFetch — integration with the disk cache
// ---------------------------------------------------------------------------

function res(status: number, headers: Record<string, string>, body = ""): FetchResult {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    text: async () => body,
    json: async () => ({}),
  };
}

describe("conditionalFetch", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "khazana-cond-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("first fetch: no conditional headers sent, stores validators", async () => {
    const caches = makeCaches(dir);
    let sentHeaders: Record<string, string> | undefined;
    const fetchFn = async (_url: string, init?: { headers?: Record<string, string> }) => {
      sentHeaders = init?.headers;
      return res(200, { etag: '"v1"' }, "<rss/>");
    };
    const out = await conditionalFetch(fetchFn, "https://feed", { A: "1" }, caches.http);
    expect(out.notModified).toBe(false);
    expect(out.result?.status).toBe(200);
    expect(sentHeaders?.["If-None-Match"]).toBeUndefined();
    // validators stored for next time
    expect(caches.http.get(urlKey("https://feed"))?.etag).toBe('"v1"');
  });

  it("second fetch: sends If-None-Match, 304 → notModified with no re-parse", async () => {
    const caches = makeCaches(dir);
    // Seed a prior fetch.
    await conditionalFetch(
      async () => res(200, { etag: '"v1"' }, "<rss/>"),
      "https://feed",
      {},
      caches.http,
    );
    let sent: Record<string, string> | undefined;
    const out = await conditionalFetch(
      async (_u, init) => {
        sent = init?.headers;
        return res(304, {});
      },
      "https://feed",
      {},
      caches.http,
    );
    expect(sent?.["If-None-Match"]).toBe('"v1"');
    expect(out.notModified).toBe(true);
    expect(out.result).toBeUndefined();
  });

  it("updates validators when a 200 comes back with a new etag", async () => {
    const caches = makeCaches(dir);
    await conditionalFetch(async () => res(200, { etag: '"v1"' }), "https://feed", {}, caches.http);
    await conditionalFetch(async () => res(200, { etag: '"v2"' }), "https://feed", {}, caches.http);
    expect(caches.http.get(urlKey("https://feed"))?.etag).toBe('"v2"');
  });
});
