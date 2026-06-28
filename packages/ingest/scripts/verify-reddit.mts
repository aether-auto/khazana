/**
 * Standalone smoke test for the reddit fetch flow (browser-UA .rss primary,
 * optional OAuth JSON escalation).
 *
 * Makes REAL network calls — the orchestrator runs this, NOT the building agent.
 * Fetches a few real subreddits via fetchReddit (real defaultFetch), paced by
 * REDDIT_MIN_GAP_MS, and prints per-sub: HTTP status, item count, and which path
 * (OAuth JSON vs .rss browser-UA) was used.
 *
 * Run from the repo root:
 *   pnpm exec tsx packages/ingest/scripts/verify-reddit.mts
 * With a bigger gap (if you hit 429s):
 *   REDDIT_MIN_GAP_MS=6000 pnpm exec tsx packages/ingest/scripts/verify-reddit.mts
 * With OAuth (higher budget):
 *   REDDIT_CLIENT_ID=... REDDIT_CLIENT_SECRET=... pnpm exec tsx packages/ingest/scripts/verify-reddit.mts
 */
import type { SourceEntry } from "@khazana/core";
import { defaultFetch, type FetchFn, type FetchResult } from "../src/fetchers/build-source.js";
import { fetchReddit, resolveRedditMinGapMs, REDDIT_BROWSER_UA } from "../src/fetchers/reddit.js";

const SUBS: Array<{ id: string; url: string }> = [
  { id: "r-physics", url: "https://www.reddit.com/r/Physics/.rss" },
  { id: "r-programming", url: "https://www.reddit.com/r/programming/.rss" },
  { id: "r-machinelearning", url: "https://www.reddit.com/r/MachineLearning/.rss" },
];

const now = new Date().toISOString();
const gapMs = resolveRedditMinGapMs();
process.stdout.write(`reddit min-gap = ${gapMs}ms  (browser UA = ${REDDIT_BROWSER_UA.slice(0, 24)}…)\n`);

/** Wrap defaultFetch to record which URLs were hit and their statuses. */
function instrument(): { fetchFn: FetchFn; log: Array<{ url: string; status: number; ok: boolean }> } {
  const log: Array<{ url: string; status: number; ok: boolean }> = [];
  const fetchFn: FetchFn = async (url, init) => {
    const res: FetchResult = await defaultFetch(url, init);
    log.push({ url, status: res.status, ok: res.ok });
    return res;
  };
  return { fetchFn, log };
}

for (let i = 0; i < SUBS.length; i++) {
  const sub = SUBS[i]!;
  // Pace requests to www.reddit.com by REDDIT_MIN_GAP_MS (the per-host limiter
  // does this in the real pipeline; here we space manually).
  if (i > 0) await new Promise((r) => setTimeout(r, gapMs));

  const entry: SourceEntry = {
    id: sub.id, type: "reddit", url: sub.url, channels: ["science"],
    enabled: true, trustScore: 0.5, addedBy: "seed", failureCount: 0,
  };
  const { fetchFn, log } = instrument();
  try {
    const items = await fetchReddit(entry, fetchFn, { now, limit: 10 });
    const usedOAuth = log.some((l) => l.url.includes("oauth.reddit.com") && l.ok);
    const statuses = log.map((l) => `${new URL(l.url).hostname}=${l.status}`).join(" ");
    process.stdout.write(
      `[${sub.id}] OK  items=${items.length}  via=${usedOAuth ? "OAUTH-JSON" : "RSS"}  statuses=[${statuses}]\n`,
    );
    if (items[0]) process.stdout.write(`[${sub.id}] sample: ${items[0].title}\n`);
  } catch (err) {
    const statuses = log.map((l) => l.status).join(",");
    process.stdout.write(`[${sub.id}] FAILED: ${err instanceof Error ? err.message : String(err)} (statuses=${statuses})\n`);
  }
}

process.stdout.write("\ndone.\n");
