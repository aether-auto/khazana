import { describe, expect, test } from "vitest";
import { WORKSHOP_BROWSE_CHANNELS } from "@khazana/core";
import {
  BUILD_SORT_KEYS,
  BUILD_SORT_DEFAULT,
  compareBuilds,
  sortBuilds,
  isBuildSortKey,
  type SortableBuild,
} from "./sort-builds.js";

const build = (over: Partial<SortableBuild> & Pick<SortableBuild, "id">): SortableBuild => ({
  id: over.id,
  source: over.source ?? "some-source",
  channel: over.channel ?? "diy",
  publishedAt: over.publishedAt ?? "2026-06-10T09:00:00.000Z",
});

const builds: SortableBuild[] = [
  build({ id: "bloom", source: "zeta-blog", channel: "iot", publishedAt: "2026-06-25T09:00:00.000Z" }),
  build({ id: "ruin", source: "alpha-blog", channel: "diy", publishedAt: "2026-06-24T09:00:00.000Z" }),
  build({ id: "carrington", source: "mid-blog", channel: "embedded", publishedAt: "2026-06-27T09:00:00.000Z" }),
  build({ id: "benford", source: "beta-blog", channel: "3d-printing", publishedAt: "2026-06-26T09:00:00.000Z" }),
];

describe("BUILD_SORT_KEYS / isBuildSortKey", () => {
  test("newest is the default sort key", () => {
    expect(BUILD_SORT_DEFAULT).toBe("newest");
  });

  test("recognizes exactly the three sort keys", () => {
    expect(BUILD_SORT_KEYS).toEqual(["newest", "channel", "source"]);
    expect(isBuildSortKey("newest")).toBe(true);
    expect(isBuildSortKey("channel")).toBe(true);
    expect(isBuildSortKey("source")).toBe(true);
    expect(isBuildSortKey("longest")).toBe(false);
    expect(isBuildSortKey("")).toBe(false);
  });
});

describe("sortBuilds — newest", () => {
  test("orders newest publishedAt first", () => {
    expect(sortBuilds(builds, "newest").map((b) => b.id)).toEqual([
      "carrington",
      "benford",
      "bloom",
      "ruin",
    ]);
  });

  test("equal timestamps tiebreak by id ascending, deterministically", () => {
    const same = "2026-06-20T00:00:00.000Z";
    const out = sortBuilds(
      [build({ id: "zeta", publishedAt: same }), build({ id: "alpha", publishedAt: same })],
      "newest",
    );
    expect(out.map((b) => b.id)).toEqual(["alpha", "zeta"]);
  });
});

describe("sortBuilds — channel", () => {
  test("orders by the canonical WORKSHOP_BROWSE_CHANNELS sequence", () => {
    const out = sortBuilds(builds, "channel", WORKSHOP_BROWSE_CHANNELS).map((b) => b.channel);
    const ranks = out.map((c) => WORKSHOP_BROWSE_CHANNELS.indexOf(c as (typeof WORKSHOP_BROWSE_CHANNELS)[number]));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  test("channels outside the provided order sort after every listed channel", () => {
    const out = sortBuilds(
      [build({ id: "x", channel: "mystery-channel" }), build({ id: "y", channel: "diy" })],
      "channel",
      WORKSHOP_BROWSE_CHANNELS,
    );
    expect(out.map((b) => b.id)).toEqual(["y", "x"]);
  });

  test("within the same channel, ties fall back to newest-first", () => {
    const out = sortBuilds(
      [
        build({ id: "old", channel: "diy", publishedAt: "2026-01-01T00:00:00.000Z" }),
        build({ id: "new", channel: "diy", publishedAt: "2026-02-01T00:00:00.000Z" }),
      ],
      "channel",
      WORKSHOP_BROWSE_CHANNELS,
    );
    expect(out.map((b) => b.id)).toEqual(["new", "old"]);
  });

  test("empty channelOrder still produces a stable, deterministic order (all rank equally)", () => {
    const out = sortBuilds(builds, "channel", []);
    expect(out.map((b) => b.id)).toEqual(sortBuilds(builds, "newest").map((b) => b.id));
  });
});

describe("sortBuilds — source", () => {
  test("orders by source name alphabetically", () => {
    expect(sortBuilds(builds, "source").map((b) => b.source)).toEqual([
      "alpha-blog",
      "beta-blog",
      "mid-blog",
      "zeta-blog",
    ]);
  });

  test("ties on source fall back to newest-first", () => {
    const out = sortBuilds(
      [
        build({ id: "old", source: "same-blog", publishedAt: "2026-01-01T00:00:00.000Z" }),
        build({ id: "new", source: "same-blog", publishedAt: "2026-02-01T00:00:00.000Z" }),
      ],
      "source",
    );
    expect(out.map((b) => b.id)).toEqual(["new", "old"]);
  });
});

describe("sortBuilds — purity", () => {
  test("never mutates the input array", () => {
    const copy = [...builds];
    sortBuilds(builds, "source");
    expect(builds).toEqual(copy);
  });
});

describe("compareBuilds", () => {
  test("is a valid comparator usable directly with Array.prototype.sort", () => {
    const a = build({ id: "a", source: "a-blog" });
    const b = build({ id: "b", source: "z-blog" });
    expect(compareBuilds(a, b, "source")).toBeLessThan(0);
    expect(compareBuilds(b, a, "source")).toBeGreaterThan(0);
  });
});
