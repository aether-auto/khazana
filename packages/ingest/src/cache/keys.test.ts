import { describe, it, expect } from "vitest";
import { urlKey, episodeKey } from "./keys.js";

describe("urlKey", () => {
  it("is a stable, lowercase hex sha256 of the url", () => {
    const k = urlKey("https://example.com/feed.xml");
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(urlKey("https://example.com/feed.xml")).toBe(k); // deterministic
  });

  it("distinguishes different urls", () => {
    expect(urlKey("https://a.com")).not.toBe(urlKey("https://b.com"));
  });
});

describe("episodeKey", () => {
  it("prefers the enclosure URL when present", () => {
    const withEnc = episodeKey("https://cdn/ep1.mp3", "guid-123");
    const encOnly = episodeKey("https://cdn/ep1.mp3", undefined);
    expect(withEnc).toBe(encOnly); // GUID ignored when enclosure present
    expect(withEnc).toMatch(/^[0-9a-f]{64}$/);
  });

  it("falls back to the GUID when there is no enclosure URL", () => {
    const k = episodeKey(undefined, "guid-123");
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(k).toBe(episodeKey("", "guid-123"));
  });

  it("returns null when neither enclosure nor guid is available", () => {
    expect(episodeKey(undefined, undefined)).toBeNull();
    expect(episodeKey("", "")).toBeNull();
  });

  it("distinguishes different episodes", () => {
    expect(episodeKey("https://cdn/ep1.mp3", undefined)).not.toBe(
      episodeKey("https://cdn/ep2.mp3", undefined),
    );
  });
});
