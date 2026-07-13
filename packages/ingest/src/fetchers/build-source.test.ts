import { afterEach, expect, test, vi } from "vitest";
import {
  buildSource,
  BROWSER_USER_AGENT,
  defaultFetch,
  FEED_ACCEPT,
  fetchTimeoutMs,
  mergeHeaders,
  type FetchFn,
  type FetchResult,
} from "./build-source.js";
import type { FeedItem, SourceEntry } from "@khazana/core";
import * as youtubeMod from "../youtube.js";
import * as discoveryMod from "../youtube-discovery.js";

const ok = (body: { text?: string; json?: unknown }): FetchResult => ({
  ok: true, status: 200,
  text: async () => body.text ?? "",
  json: async () => body.json ?? {},
});

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
  <item><title>One</title><link>https://e.com/1</link></item>
  <item><title>Two</title><link>https://e.com/2</link></item>
</channel></rss>`;

const rssEntry: SourceEntry = {
  id: "blog", type: "rss", url: "https://e.com/feed", channels: ["tech"],
  enabled: true, trustScore: 0.6, addedBy: "seed", failureCount: 0,
};

test("buildSource fetches, parses RSS, and respects ctx.limit", async () => {
  const fetchFn: FetchFn = async () => ok({ text: RSS });
  const items = await buildSource(rssEntry, fetchFn).fetch({ now: "2026-06-23T00:00:00.000Z", limit: 1 });
  expect(items).toHaveLength(1);
  expect(items[0]!.title).toBe("One");
});

test("buildSource fetches reddit via the .rss feed with a browser User-Agent", async () => {
  // No OAuth creds in env → the $0 default path: registry .rss + browser UA.
  delete process.env["REDDIT_CLIENT_ID"];
  delete process.env["REDDIT_CLIENT_SECRET"];
  let sentUA: string | undefined;
  let sentUrl: string | undefined;
  const REDDIT_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry><title>Reddit thread</title><link href="https://www.reddit.com/r/x/comments/z/thread/"/></entry>
</feed>`;
  const fetchFn: FetchFn = async (url, init) => {
    sentUA = init?.headers?.["User-Agent"];
    sentUrl = url;
    return ok({ text: REDDIT_RSS });
  };
  const reddit: SourceEntry = { ...rssEntry, id: "r-x", type: "reddit", url: "https://www.reddit.com/r/x/.rss" };
  const items = await buildSource(reddit, fetchFn).fetch({ now: "2026-06-23T00:00:00.000Z" });
  expect(sentUrl).toBe("https://www.reddit.com/r/x/.rss"); // the registry .rss url, unchanged
  expect(sentUA).toContain("Mozilla/5.0"); // browser-like UA, not a bot UA
  expect(items).toHaveLength(1);
  expect(items[0]!.title).toBe("Reddit thread");
  expect(items[0]!.kind).toBe("discussion");
});

test("buildSource throws on non-OK HTTP", async () => {
  const fetchFn: FetchFn = async () => ({ ok: false, status: 503, text: async () => "", json: async () => ({}) });
  await expect(buildSource(rssEntry, fetchFn).fetch({ now: "2026-06-23T00:00:00.000Z" })).rejects.toThrow("503");
});

test("buildSource sends a browser User-Agent and feed-appropriate Accept on the generic fetch", async () => {
  let sentHeaders: Record<string, string> | undefined;
  const fetchFn: FetchFn = async (_url, init) => {
    sentHeaders = init?.headers;
    return ok({ text: RSS });
  };
  await buildSource(rssEntry, fetchFn).fetch({ now: "2026-06-23T00:00:00.000Z" });
  expect(sentHeaders?.["User-Agent"]).toBe(BROWSER_USER_AGENT);
  expect(sentHeaders?.["User-Agent"]).toContain("Mozilla/5.0"); // browser-like, not a bot UA
  expect(sentHeaders?.["Accept"]).toBe(FEED_ACCEPT);
  expect(sentHeaders?.["Accept"]).toContain("application/rss+xml"); // fixes the 406 class
});

test("caller-provided headers override the generic defaults", async () => {
  let sentHeaders: Record<string, string> | undefined;
  const fetchFn: FetchFn = async (_url, init) => {
    sentHeaders = init?.headers;
    return ok({ text: RSS });
  };
  // A caller that passes explicit headers wins over the defaults.
  await buildSource(rssEntry, fetchFn, { headers: { "User-Agent": "custom-agent/9.9" } }).fetch({
    now: "2026-06-23T00:00:00.000Z",
  });
  expect(sentHeaders?.["User-Agent"]).toBe("custom-agent/9.9"); // override wins
  expect(sentHeaders?.["Accept"]).toBe(FEED_ACCEPT); // gap still filled by default
});

test("mergeHeaders lets overrides win and is case-insensitive on duplicate header names", () => {
  const merged = mergeHeaders(
    { "User-Agent": "default-ua", Accept: "default-accept" },
    { "user-agent": "override-ua" },
  );
  expect(merged["user-agent"] ?? merged["User-Agent"]).toBe("override-ua");
  expect(merged["Accept"]).toBe("default-accept");
});

test("the generic fetch routes through defaultFetch with redirect:follow set explicitly", async () => {
  // Spy the global fetch to assert defaultFetch opts in to redirect following.
  const globalFetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(RSS, { status: 200 }));
  // No injected FetchFn → buildSource uses the real defaultFetch.
  await buildSource(rssEntry).fetch({ now: "2026-06-23T00:00:00.000Z" });
  expect(globalFetchSpy).toHaveBeenCalledWith(
    rssEntry.url,
    expect.objectContaining({ redirect: "follow" }),
  );
  globalFetchSpy.mockRestore();
});

afterEach(() => {
  delete process.env["INGEST_FETCH_TIMEOUT_MS"];
});

test("fetchTimeoutMs defaults to 15000 when unset", () => {
  delete process.env["INGEST_FETCH_TIMEOUT_MS"];
  expect(fetchTimeoutMs()).toBe(15000);
});

test("fetchTimeoutMs honors INGEST_FETCH_TIMEOUT_MS", () => {
  process.env["INGEST_FETCH_TIMEOUT_MS"] = "500";
  expect(fetchTimeoutMs()).toBe(500);
});

test("fetchTimeoutMs falls back to 15000 on NaN / garbage", () => {
  process.env["INGEST_FETCH_TIMEOUT_MS"] = "not-a-number";
  expect(fetchTimeoutMs()).toBe(15000);
  process.env["INGEST_FETCH_TIMEOUT_MS"] = "";
  expect(fetchTimeoutMs()).toBe(15000);
});

test("defaultFetch passes an AbortSignal and aborts a hanging fetch within the timeout", async () => {
  // Very low timeout so the test is fast + deterministic.
  process.env["INGEST_FETCH_TIMEOUT_MS"] = "40";
  let receivedSignal: AbortSignal | undefined;
  const globalFetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation((_url, init?: RequestInit) => {
      receivedSignal = init?.signal ?? undefined;
      // Never resolves on its own; only rejects when the passed signal aborts,
      // exactly like a hung network socket that native fetch would abort.
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return; // no signal → would hang forever (the bug); test asserts otherwise
        signal.addEventListener("abort", () => {
          reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
        });
      });
    });

  await expect(
    defaultFetch("https://hang.example/feed", { headers: {} }),
  ).rejects.toThrow();

  expect(receivedSignal).toBeInstanceOf(AbortSignal);
  globalFetchSpy.mockRestore();
});

test("reddit is untouched: still routes to the dedicated reddit flow, not the generic Accept path", async () => {
  delete process.env["REDDIT_CLIENT_ID"];
  delete process.env["REDDIT_CLIENT_SECRET"];
  let sentHeaders: Record<string, string> | undefined;
  const REDDIT_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry><title>Reddit thread</title><link href="https://www.reddit.com/r/x/comments/z/thread/"/></entry>
</feed>`;
  const fetchFn: FetchFn = async (_url, init) => {
    sentHeaders = init?.headers;
    return ok({ text: REDDIT_RSS });
  };
  const reddit: SourceEntry = { ...rssEntry, id: "r-x", type: "reddit", url: "https://www.reddit.com/r/x/.rss" };
  await buildSource(reddit, fetchFn).fetch({ now: "2026-06-23T00:00:00.000Z" });
  // The reddit flow sets its own browser UA and does NOT send the generic feed Accept.
  expect(sentHeaders?.["User-Agent"]).toContain("Mozilla/5.0");
  expect(sentHeaders?.["Accept"]).toBeUndefined();
});

const ytEntry: SourceEntry = {
  ...rssEntry,
  id: "youtube-veritasium",
  type: "youtube",
  url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCHnyfMqiRRG1u-2MsSQLbXA",
  channels: ["science"],
};

const YT_RSS_ONE = `<?xml version="1.0"?><rss version="2.0"><channel>
  <item><title>Fresh RSS video</title><link>https://youtube.com/watch?v=rssvid1</link></item>
</channel></rss>`;

const fakeYtDlpItems: FeedItem[] = [
  {
    id: "fake1", source: ytEntry.id, sourceType: "youtube",
    url: "https://www.youtube.com/watch?v=abc123DEF45", title: "A yt-dlp discovered video",
    publishedAt: "2026-06-23T00:00:00.000Z", fetchedAt: "2026-06-23T00:00:00.000Z",
    topics: ["science"], entities: [], summary: "", media: [], kind: "video",
  },
];

test("youtube prefers RSS videos.xml and does NOT call yt-dlp when RSS yields items (even with ALLOW_DIRECT_YOUTUBE=1 + yt-dlp available)", async () => {
  // RSS-first: the videos.xml endpoint is live for the vast majority of
  // channels, so a successful RSS fetch must short-circuit before the yt-dlp
  // subprocess path (which is frequently blocked on shared CI IPs and returns
  // nothing — the root cause of the whole youtube path shipping zero items).
  process.env["ALLOW_DIRECT_YOUTUBE"] = "1";
  const isAvailSpy = vi.spyOn(youtubeMod, "isYtDlpAvailable").mockReturnValue(true);
  const discoverySpy = vi
    .spyOn(discoveryMod, "fetchYouTubeChannelVideos")
    .mockResolvedValue(fakeYtDlpItems);
  let sentUrl: string | undefined;
  const fetchFn: FetchFn = async (url) => {
    sentUrl = url;
    return ok({ text: YT_RSS_ONE });
  };
  const items = await buildSource(ytEntry, fetchFn).fetch({ now: "2026-06-23T00:00:00.000Z" });
  expect(sentUrl).toBe(ytEntry.url); // tried the videos.xml RSS endpoint first
  expect(discoverySpy).not.toHaveBeenCalled(); // RSS had items → yt-dlp never touched
  expect(items).toHaveLength(1);
  expect(items[0]!.title).toBe("Fresh RSS video");
  expect(items[0]!.kind).toBe("video");
  discoverySpy.mockRestore();
  isAvailSpy.mockRestore();
  delete process.env["ALLOW_DIRECT_YOUTUBE"];
});

test("youtube falls back to yt-dlp when RSS yields zero items and yt-dlp is gated on + available", async () => {
  process.env["ALLOW_DIRECT_YOUTUBE"] = "1";
  const isAvailSpy = vi.spyOn(youtubeMod, "isYtDlpAvailable").mockReturnValue(true);
  const discoverySpy = vi
    .spyOn(discoveryMod, "fetchYouTubeChannelVideos")
    .mockResolvedValue(fakeYtDlpItems);
  // RSS 200 but an EMPTY channel feed (no <item>s) → fall back to yt-dlp.
  const EMPTY_RSS = `<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>`;
  const fetchFn: FetchFn = async () => ok({ text: EMPTY_RSS });
  const items = await buildSource(ytEntry, fetchFn).fetch({ now: "2026-06-23T00:00:00.000Z" });
  expect(discoverySpy).toHaveBeenCalledWith(
    ytEntry,
    expect.objectContaining({ now: "2026-06-23T00:00:00.000Z" }),
  );
  expect(items).toEqual(fakeYtDlpItems);
  discoverySpy.mockRestore();
  isAvailSpy.mockRestore();
  delete process.env["ALLOW_DIRECT_YOUTUBE"];
});

test("youtube falls back to yt-dlp when the RSS fetch hard-fails (non-200) and yt-dlp is available", async () => {
  process.env["ALLOW_DIRECT_YOUTUBE"] = "1";
  const isAvailSpy = vi.spyOn(youtubeMod, "isYtDlpAvailable").mockReturnValue(true);
  const discoverySpy = vi
    .spyOn(discoveryMod, "fetchYouTubeChannelVideos")
    .mockResolvedValue(fakeYtDlpItems);
  const fetchFn: FetchFn = async () => ({ ok: false, status: 403, text: async () => "", json: async () => ({}) });
  const items = await buildSource(ytEntry, fetchFn).fetch({ now: "2026-06-23T00:00:00.000Z" });
  expect(discoverySpy).toHaveBeenCalled();
  expect(items).toEqual(fakeYtDlpItems);
  discoverySpy.mockRestore();
  isAvailSpy.mockRestore();
  delete process.env["ALLOW_DIRECT_YOUTUBE"];
});

test("youtube re-throws a hard RSS failure when yt-dlp yields nothing, so the source is struck toward auto-disable", async () => {
  // A genuinely-dead channel: RSS 404 AND yt-dlp returns nothing. The 404 must
  // surface (not be swallowed to []) so reconcile classifies it permanent and
  // strikes it toward DISABLE_THRESHOLD.
  process.env["ALLOW_DIRECT_YOUTUBE"] = "1";
  const isAvailSpy = vi.spyOn(youtubeMod, "isYtDlpAvailable").mockReturnValue(true);
  const discoverySpy = vi
    .spyOn(discoveryMod, "fetchYouTubeChannelVideos")
    .mockResolvedValue([]); // yt-dlp also finds nothing
  const fetchFn: FetchFn = async () => ({ ok: false, status: 404, text: async () => "", json: async () => ({}) });
  await expect(
    buildSource(ytEntry, fetchFn).fetch({ now: "2026-06-23T00:00:00.000Z" }),
  ).rejects.toThrow("404");
  expect(discoverySpy).toHaveBeenCalled();
  discoverySpy.mockRestore();
  isAvailSpy.mockRestore();
  delete process.env["ALLOW_DIRECT_YOUTUBE"];
});

test("youtube re-throws a hard RSS failure when yt-dlp is unavailable", async () => {
  process.env["ALLOW_DIRECT_YOUTUBE"] = "1";
  const isAvailSpy = vi.spyOn(youtubeMod, "isYtDlpAvailable").mockReturnValue(false);
  const discoverySpy = vi.spyOn(discoveryMod, "fetchYouTubeChannelVideos");
  const fetchFn: FetchFn = async () => ({ ok: false, status: 503, text: async () => "", json: async () => ({}) });
  await expect(
    buildSource(ytEntry, fetchFn).fetch({ now: "2026-06-23T00:00:00.000Z" }),
  ).rejects.toThrow("503");
  expect(discoverySpy).not.toHaveBeenCalled();
  discoverySpy.mockRestore();
  isAvailSpy.mockRestore();
  delete process.env["ALLOW_DIRECT_YOUTUBE"];
});

test("youtube falls through to the RSS videos.xml path when yt-dlp is unavailable", async () => {
  process.env["ALLOW_DIRECT_YOUTUBE"] = "1";
  const isAvailSpy = vi.spyOn(youtubeMod, "isYtDlpAvailable").mockReturnValue(false);
  const discoverySpy = vi.spyOn(discoveryMod, "fetchYouTubeChannelVideos");
  const YT_RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
    <item><title>Legacy RSS video</title><link>https://youtube.com/watch?v=legacy123</link></item>
  </channel></rss>`;
  let sentUrl: string | undefined;
  const fetchFn: FetchFn = async (url) => {
    sentUrl = url;
    return ok({ text: YT_RSS });
  };
  const items = await buildSource(ytEntry, fetchFn).fetch({ now: "2026-06-23T00:00:00.000Z" });
  expect(sentUrl).toBe(ytEntry.url); // fell through to the generic videos.xml fetch
  expect(discoverySpy).not.toHaveBeenCalled();
  expect(items).toHaveLength(1);
  expect(items[0]!.kind).toBe("video");
  discoverySpy.mockRestore();
  isAvailSpy.mockRestore();
  delete process.env["ALLOW_DIRECT_YOUTUBE"];
});

test("youtube falls through to RSS by default (ALLOW_DIRECT_YOUTUBE unset)", async () => {
  delete process.env["ALLOW_DIRECT_YOUTUBE"];
  const discoverySpy = vi.spyOn(discoveryMod, "fetchYouTubeChannelVideos");
  const YT_RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
    <item><title>Legacy RSS video</title><link>https://youtube.com/watch?v=legacy123</link></item>
  </channel></rss>`;
  const fetchFn: FetchFn = async () => ok({ text: YT_RSS });
  const items = await buildSource(ytEntry, fetchFn).fetch({ now: "2026-06-23T00:00:00.000Z" });
  expect(discoverySpy).not.toHaveBeenCalled();
  expect(items).toHaveLength(1);
  discoverySpy.mockRestore();
});
