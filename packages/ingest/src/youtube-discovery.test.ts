import { afterEach, describe, expect, test } from "vitest";
import { FeedItemSchema, type SourceEntry } from "@khazana/core";
import {
  buildYtDlpDiscoveryArgs,
  DEFAULT_YT_DLP_DISCOVERY_LIMIT,
  extractYouTubeChannelId,
  fetchYouTubeChannelVideos,
  parseYtDlpDiscoveryOutput,
  ytDlpDiscoveryLimit,
  type DiscoveryExecRunner,
} from "./youtube-discovery.js";
import { YtDlpGate, type GateClock } from "./youtube.js";

const entry: SourceEntry = {
  id: "youtube-veritasium",
  type: "youtube",
  url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCHnyfMqiRRG1u-2MsSQLbXA",
  channels: ["science"],
  enabled: true,
  trustScore: 0.85,
  addedBy: "seed",
  failureCount: 0,
};

// A deterministic gate: no real timers (mirrors youtube-meta.test.ts's fakeGate()),
// wrapped so tests can assert discovery is actually paced through it.
function fakeGate(): { gate: YtDlpGate; runCount: () => number } {
  let t = 0;
  let calls = 0;
  const clock: GateClock = { now: () => t, sleep: async (ms) => void (t += ms) };
  const gate = new YtDlpGate(() => 0, clock);
  const originalRun = gate.run.bind(gate);
  gate.run = <T,>(fn: () => Promise<T>): Promise<T> => {
    calls += 1;
    return originalRun(fn);
  };
  return { gate, runCount: () => calls };
}

describe("extractYouTubeChannelId", () => {
  test("extracts the channel_id from a videos.xml registry URL", () => {
    expect(
      extractYouTubeChannelId(
        "https://www.youtube.com/feeds/videos.xml?channel_id=UCHnyfMqiRRG1u-2MsSQLbXA",
      ),
    ).toBe("UCHnyfMqiRRG1u-2MsSQLbXA");
  });

  test("returns null when no channel_id is present", () => {
    expect(extractYouTubeChannelId("https://www.youtube.com/feeds/videos.xml")).toBeNull();
  });
});

describe("buildYtDlpDiscoveryArgs", () => {
  test("builds flat-playlist args against the channel videos tab", () => {
    const args = buildYtDlpDiscoveryArgs("UCHnyfMqiRRG1u-2MsSQLbXA", 5);
    expect(args).toContain("--flat-playlist");
    expect(args).toContain("--playlist-end");
    expect(args).toContain("5");
    expect(args).toContain("--print");
    expect(args).toContain("%(id)s\t%(title)s");
    expect(args[args.length - 1]).toBe(
      "https://www.youtube.com/channel/UCHnyfMqiRRG1u-2MsSQLbXA/videos",
    );
  });
});

describe("ytDlpDiscoveryLimit", () => {
  afterEach(() => {
    delete process.env["YT_DLP_DISCOVERY_LIMIT"];
  });

  test("defaults when unset", () => {
    delete process.env["YT_DLP_DISCOVERY_LIMIT"];
    expect(ytDlpDiscoveryLimit()).toBe(DEFAULT_YT_DLP_DISCOVERY_LIMIT);
  });

  test("honors YT_DLP_DISCOVERY_LIMIT", () => {
    process.env["YT_DLP_DISCOVERY_LIMIT"] = "3";
    expect(ytDlpDiscoveryLimit()).toBe(3);
  });

  test("falls back to default on garbage", () => {
    process.env["YT_DLP_DISCOVERY_LIMIT"] = "not-a-number";
    expect(ytDlpDiscoveryLimit()).toBe(DEFAULT_YT_DLP_DISCOVERY_LIMIT);
  });
});

describe("parseYtDlpDiscoveryOutput", () => {
  test("parses id\\ttitle lines, skipping blanks and NA rows", () => {
    const stdout = [
      "abc123DEF45\tThe Real Reason Ice Is Slippery",
      "",
      "NA\tDeleted video",
      "xyz789ghi01\tNA",
      "  ",
      "qqq111www22\tHow Feynman Diagrams Work",
    ].join("\n");
    const rows = parseYtDlpDiscoveryOutput(stdout);
    expect(rows).toEqual([
      { id: "abc123DEF45", title: "The Real Reason Ice Is Slippery" },
      { id: "qqq111www22", title: "How Feynman Diagrams Work" },
    ]);
  });

  test("returns [] for empty stdout", () => {
    expect(parseYtDlpDiscoveryOutput("")).toEqual([]);
  });
});

describe("fetchYouTubeChannelVideos", () => {
  test("maps mocked yt-dlp lines to valid FeedItems", async () => {
    const run: DiscoveryExecRunner = async () =>
      "abc123DEF45\tThe Real Reason Ice Is Slippery\nqqq111www22\tHow Feynman Diagrams Work\n";
    const { gate } = fakeGate();
    const items = await fetchYouTubeChannelVideos(entry, { now: "2026-07-07T00:00:00.000Z" }, {
      run,
      gate,
    });
    expect(items).toHaveLength(2);
    expect(items[0]!.url).toBe("https://www.youtube.com/watch?v=abc123DEF45");
    expect(items[0]!.title).toBe("The Real Reason Ice Is Slippery");
    expect(items[0]!.sourceType).toBe("youtube");
    expect(items[0]!.kind).toBe("video");
    expect(items[0]!.topics).toEqual(["science"]);
    for (const item of items) {
      expect(FeedItemSchema.safeParse(item).success).toBe(true);
    }
  });

  test("is paced through the supplied gate", async () => {
    const run: DiscoveryExecRunner = async () => "abc123DEF45\tSome Title\n";
    const { gate, runCount } = fakeGate();
    await fetchYouTubeChannelVideos(entry, { now: "2026-07-07T00:00:00.000Z" }, { run, gate });
    expect(runCount()).toBe(1);
  });

  test("passes the extracted channel id and configured limit to the arg builder via run()", async () => {
    let seenArgs: readonly string[] = [];
    const run: DiscoveryExecRunner = async (args) => {
      seenArgs = args;
      return "";
    };
    const { gate } = fakeGate();
    await fetchYouTubeChannelVideos(entry, { now: "2026-07-07T00:00:00.000Z" }, { run, gate, limit: 3 });
    expect(seenArgs).toContain("--flat-playlist");
    expect(seenArgs).toContain("3");
    expect(seenArgs[seenArgs.length - 1]).toBe(
      "https://www.youtube.com/channel/UCHnyfMqiRRG1u-2MsSQLbXA/videos",
    );
  });

  test("fails soft (returns []) when the channel_id cannot be extracted", async () => {
    const badEntry: SourceEntry = { ...entry, url: "https://www.youtube.com/feeds/videos.xml" };
    const run: DiscoveryExecRunner = async () => "abc123DEF45\tShould never be called\n";
    const { gate } = fakeGate();
    const items = await fetchYouTubeChannelVideos(badEntry, { now: "2026-07-07T00:00:00.000Z" }, {
      run,
      gate,
    });
    expect(items).toEqual([]);
  });

  test("fails soft (returns []) when the yt-dlp subprocess throws", async () => {
    const run: DiscoveryExecRunner = async () => {
      throw new Error("yt-dlp exploded");
    };
    const { gate } = fakeGate();
    const items = await fetchYouTubeChannelVideos(entry, { now: "2026-07-07T00:00:00.000Z" }, {
      run,
      gate,
    });
    expect(items).toEqual([]);
  });

  test("fails soft (returns []) on empty stdout", async () => {
    const run: DiscoveryExecRunner = async () => "";
    const { gate } = fakeGate();
    const items = await fetchYouTubeChannelVideos(entry, { now: "2026-07-07T00:00:00.000Z" }, {
      run,
      gate,
    });
    expect(items).toEqual([]);
  });

  test("respects ctx.limit", async () => {
    const run: DiscoveryExecRunner = async () =>
      "id1aaaaaaaa\tOne\nid2bbbbbbbb\tTwo\nid3ccccccc3\tThree\n";
    const { gate } = fakeGate();
    const items = await fetchYouTubeChannelVideos(
      entry,
      { now: "2026-07-07T00:00:00.000Z", limit: 1 },
      { run, gate },
    );
    expect(items).toHaveLength(1);
  });
});
