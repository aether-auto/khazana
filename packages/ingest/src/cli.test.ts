import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { main } from "./cli.js";
import type { FetchFn } from "./fetchers/build-source.js";

let dir: string;
const seed = {
  version: 1,
  sources: [
    { id: "good", type: "rss", url: "https://a.com/feed", channels: ["tech"] },
    { id: "bad", type: "rss", url: "https://b.com/feed", channels: ["ai"] },
  ],
};

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><item><title>Hi</title><link>https://a.com/1</link></item></channel></rss>`;
const NOW = "2026-06-23T00:00:00.000Z";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "khz-cli-"));
  writeFileSync(join(dir, "sources.seed.json"), JSON.stringify(seed));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function loadReg() {
  return JSON.parse(readFileSync(join(dir, "sources.json"), "utf8")) as {
    sources: Array<Record<string, unknown> & { id: string }>;
  };
}

test("main writes feed and persists success/transient health", async () => {
  const fetchFn: FetchFn = async (url) => {
    if (url.includes("b.com")) throw new Error("down"); // network → transient
    return { ok: true, status: 200, text: async () => RSS, json: async () => ({}) };
  };
  await main(dir, NOW, fetchFn);

  const feed = JSON.parse(readFileSync(join(dir, "feed", "raw.json"), "utf8"));
  expect(feed).toHaveLength(1);

  const reg = loadReg();
  const good = reg.sources.find((s) => s.id === "good")!;
  const bad = reg.sources.find((s) => s.id === "bad")!;

  // Success → active, strikes reset, legacy failureCount reset, lastOkAt set.
  expect(good.lastFetchedAt).toBe(NOW);
  expect(good.lastOkAt).toBe(NOW);
  expect(good.status).toBe("active");
  expect(good.consecutiveFailures).toBe(0);
  expect(good.failureCount).toBe(0);

  // Transient failure → failing, NO strike, still enabled.
  expect(bad.status).toBe("failing");
  expect(bad.consecutiveFailures).toBe(0);
  expect(bad.enabled).toBe(true);
  expect((bad.lastError as { kind: string }).kind).toBe("transient");
});

test("a permanent 404, struck to threshold, auto-disables (after failed rediscovery)", async () => {
  // b.com returns a hard 404 (permanent). Start it near the threshold.
  writeFileSync(
    join(dir, "sources.json"),
    JSON.stringify({
      version: 1,
      sources: [
        { id: "good", type: "rss", url: "https://a.com/feed", channels: ["tech"] },
        { id: "bad", type: "rss", url: "https://b.com/feed", channels: ["ai"], consecutiveFailures: 2 },
      ],
    }),
  );
  const fetchFn: FetchFn = async (url) => {
    if (url.includes("b.com")) throw new Error("b.com: HTTP 404");
    return { ok: true, status: 200, text: async () => RSS, json: async () => ({}) };
  };
  await main(dir, NOW, fetchFn);

  const bad = loadReg().sources.find((s) => s.id === "bad")!;
  expect(bad.consecutiveFailures).toBe(3);
  expect(bad.status).toBe("disabled");
  expect(bad.enabled).toBe(false);
  expect((bad.lastError as { kind: string }).kind).toBe("permanent");
});

test("a disabled source still inside its re-probe window is skipped on the next run", async () => {
  writeFileSync(
    join(dir, "sources.json"),
    JSON.stringify({
      version: 1,
      sources: [
        { id: "good", type: "rss", url: "https://a.com/feed", channels: ["tech"] },
        {
          id: "off",
          type: "rss",
          url: "https://off.com/feed",
          channels: ["ai"],
          enabled: false,
          status: "disabled",
          disabledAt: "2026-06-22T00:00:00.000Z", // 1 day before NOW — well inside the 7-day window
        },
      ],
    }),
  );
  let offHit = false;
  const fetchFn: FetchFn = async (url) => {
    if (url.includes("off.com")) offHit = true;
    return { ok: true, status: 200, text: async () => RSS, json: async () => ({}) };
  };
  await main(dir, NOW, fetchFn);
  expect(offHit).toBe(false); // never fetched

  const off = loadReg().sources.find((s) => s.id === "off")!;
  expect(off.status).toBe("disabled"); // untouched (no fetch result)
  expect(off.enabled).toBe(false);
});

test("a disabled source past its re-probe window self-heals: re-fetched and re-enabled on success", async () => {
  // No `disabledAt` — exactly the shape of the ~208 pre-existing youtube
  // sources auto-disabled before this field existed. Treated as already past
  // the window, so a resolved systemic outage (the actual bug this fixes)
  // self-heals on the very next run without a manual registry edit.
  writeFileSync(
    join(dir, "sources.json"),
    JSON.stringify({
      version: 1,
      sources: [
        { id: "good", type: "rss", url: "https://a.com/feed", channels: ["tech"] },
        { id: "off", type: "rss", url: "https://off.com/feed", channels: ["ai"], enabled: false, status: "disabled" },
      ],
    }),
  );
  let offHit = false;
  const fetchFn: FetchFn = async (url) => {
    if (url.includes("off.com")) offHit = true;
    return { ok: true, status: 200, text: async () => RSS, json: async () => ({}) };
  };
  await main(dir, NOW, fetchFn);
  expect(offHit).toBe(true); // bounded single re-probe fetch this run

  const off = loadReg().sources.find((s) => s.id === "off")!;
  expect(off.status).toBe("active"); // re-probe succeeded → fully re-enabled
  expect(off.enabled).toBe(true);
  expect(off.disabledAt).toBeUndefined();
});
