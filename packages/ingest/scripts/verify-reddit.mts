/**
 * Standalone smoke test for the reddit fetch flow (JSON API → .rss fallback).
 *
 * Makes REAL network calls — the orchestrator runs this, NOT the building agent.
 * Fetches a few real subreddits via the new fetchReddit flow (real defaultFetch)
 * and prints, per sub: item count, whether JSON or RSS-fallback was used, and any
 * 429/403 blocks observed.
 *
 * Run from the repo root:
 *   pnpm exec tsx packages/ingest/scripts/verify-reddit.mts
 */
import type { SourceEntry } from "@khazana/core";
import { defaultFetch, type FetchFn, type FetchResult } from "../src/fetchers/build-source.js";
import { fetchReddit, redditJsonUrl } from "../src/fetchers/reddit.js";

const SUBS: Array<{ id: string; url: string }> = [
  { id: "r-physics", url: "https://www.reddit.com/r/Physics/.rss" },
  { id: "r-programming", url: "https://www.reddit.com/r/programming/.rss" },
  { id: "r-machinelearning", url: "https://www.reddit.com/r/MachineLearning/.rss" },
];

const now = new Date().toISOString();

/** Wrap defaultFetch to record which URLs were hit and any block statuses. */
function instrument(): { fetchFn: FetchFn; log: Array<{ url: string; status: number; ok: boolean }> } {
  const log: Array<{ url: string; status: number; ok: boolean }> = [];
  const fetchFn: FetchFn = async (url, init) => {
    const res: FetchResult = await defaultFetch(url, init);
    log.push({ url, status: res.status, ok: res.ok });
    return res;
  };
  return { fetchFn, log };
}

for (const sub of SUBS) {
  const entry: SourceEntry = {
    id: sub.id, type: "reddit", url: sub.url, channels: ["science"],
    enabled: true, trustScore: 0.5, addedBy: "seed", failureCount: 0,
  };
  const { fetchFn, log } = instrument();
  process.stdout.write(`\n[${sub.id}] json url = ${redditJsonUrl(sub.url, { limit: 10 })}\n`);
  try {
    const items = await fetchReddit(entry, fetchFn, { now, limit: 10 });
    const usedRss = log.some((l) => l.url.endsWith(".rss") && l.ok);
    const blocks = log.filter((l) => l.status === 429 || l.status === 403);
    process.stdout.write(
      `[${sub.id}] OK  items=${items.length}  via=${usedRss ? "RSS-FALLBACK" : "JSON"}  ` +
        `blocks=${blocks.length}${blocks.length ? " (" + blocks.map((b) => b.status).join(",") + ")" : ""}\n`,
    );
    if (items[0]) process.stdout.write(`[${sub.id}] sample: ${items[0].title}\n`);
  } catch (err) {
    process.stdout.write(`[${sub.id}] FAILED: ${err instanceof Error ? err.message : String(err)}\n`);
    process.stdout.write(`[${sub.id}] request log: ${JSON.stringify(log)}\n`);
  }
  // Be polite between subs (the harness has no PerHostLimiter wrapping it).
  await new Promise((r) => setTimeout(r, 1500));
}

process.stdout.write("\ndone.\n");
