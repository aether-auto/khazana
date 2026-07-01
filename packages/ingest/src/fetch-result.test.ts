import { describe, it, expect } from "vitest";
import { classifyError, classifyOk, isPermanent, type SourceFetchResult } from "./fetch-result.js";

describe("classifyOk", () => {
  it("produces an ok result with item count and final url", () => {
    const r = classifyOk("src-1", 12, "https://feed.example.com/rss");
    expect(r).toEqual<SourceFetchResult>({
      sourceId: "src-1",
      ok: true,
      httpStatus: 200,
      errorKind: "ok",
      itemCount: 12,
      finalUrl: "https://feed.example.com/rss",
    });
  });
});

describe("classifyError", () => {
  it("classifies a 404 as a permanent http-4xx", () => {
    const r = classifyError("s", new Error("s: HTTP 404"));
    expect(r.ok).toBe(false);
    expect(r.httpStatus).toBe(404);
    expect(r.errorKind).toBe("http-4xx");
    expect(r.itemCount).toBe(0);
  });

  it("classifies a 410 as http-4xx", () => {
    expect(classifyError("s", new Error("HTTP 410")).errorKind).toBe("http-4xx");
  });

  it("classifies a 429 as transient http-4xx? no — as its own transient class", () => {
    const r = classifyError("s", new Error("HTTP 429"));
    expect(r.httpStatus).toBe(429);
    // 429 is transient; treated as http-4xx kind but NOT permanent.
    expect(isPermanent(r)).toBe(false);
  });

  it("classifies a 500/503 as transient http-5xx", () => {
    const r = classifyError("s", new Error("HTTP 503"));
    expect(r.errorKind).toBe("http-5xx");
    expect(isPermanent(r)).toBe(false);
  });

  it("classifies DNS failures as permanent dns", () => {
    const r = classifyError("s", new Error("getaddrinfo ENOTFOUND feed.dead.example"));
    expect(r.errorKind).toBe("dns");
    expect(isPermanent(r)).toBe(true);
  });

  it("classifies a timeout as transient", () => {
    const r = classifyError("s", new Error("The operation timed out"));
    expect(r.errorKind).toBe("timeout");
    expect(isPermanent(r)).toBe(false);
  });

  it("classifies parse failures as permanent not-a-feed", () => {
    const r = classifyError("s", new Error("Feed not recognized as RSS or Atom"));
    expect(r.errorKind).toBe("not-a-feed");
    expect(isPermanent(r)).toBe(true);
  });

  it("classifies a bare ECONNRESET as transient network", () => {
    const r = classifyError("s", new Error("read ECONNRESET"));
    expect(r.errorKind).toBe("network");
    expect(isPermanent(r)).toBe(false);
  });
});

describe("isPermanent", () => {
  it("marks 404/410, dns, not-a-feed permanent; 429/5xx/timeout/network transient", () => {
    const perm: SourceFetchResult["errorKind"][] = ["dns", "not-a-feed"];
    for (const kind of perm) {
      expect(isPermanent({ sourceId: "s", ok: false, errorKind: kind, itemCount: 0 })).toBe(true);
    }
    expect(isPermanent({ sourceId: "s", ok: false, errorKind: "http-4xx", httpStatus: 404, itemCount: 0 })).toBe(true);
    expect(isPermanent({ sourceId: "s", ok: false, errorKind: "http-4xx", httpStatus: 429, itemCount: 0 })).toBe(false);
    expect(isPermanent({ sourceId: "s", ok: false, errorKind: "http-5xx", httpStatus: 500, itemCount: 0 })).toBe(false);
    expect(isPermanent({ sourceId: "s", ok: false, errorKind: "timeout", itemCount: 0 })).toBe(false);
    expect(isPermanent({ sourceId: "s", ok: false, errorKind: "network", itemCount: 0 })).toBe(false);
  });

  it("an ok result is never permanent-failure", () => {
    expect(isPermanent(classifyOk("s", 1))).toBe(false);
  });
});
