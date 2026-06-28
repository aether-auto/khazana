// Verify the paced yt-dlp transcript path against REAL YouTube videos.
//
// Calls the new `fetchYtDlpTranscript` (real subprocess) with
// `ALLOW_DIRECT_YOUTUBE=1` and a configurable `YT_DLP_MIN_GAP_MS`, for a few
// real video ids, and prints per video: transcript word count, whether captions
// were found, elapsed ms, and the actual gap observed between consecutive
// invocations — confirming the process-level rate-limit gate is honored.
//
// $0 / OSS only (yt-dlp). The ORCHESTRATOR runs this — NOT the implementer.
// Requires `yt-dlp` on PATH (`pip install "yt-dlp[default,curl-cffi]"` for
// browser impersonation; plain `pip install yt-dlp` works too).
//
//   ALLOW_DIRECT_YOUTUBE=1 YT_DLP_MIN_GAP_MS=4000 \
//     pnpm exec tsx packages/ingest/scripts/verify-ytdlp.mts
//
// Optional knobs:
//   YT_DLP_VERIFY_IDS="dQw4w9WgXcQ,9bZkp7q19f0"   override the id list
//   YT_DLP_SLEEP_REQUESTS / YT_DLP_SLEEP_SUBTITLES  yt-dlp's own pacing (s)
//   YT_DLP_IMPERSONATE=1                            pass --impersonate chrome

import { fetchYtDlpTranscript, isYtDlpAvailable, ytDlpMinGapMs } from "../src/youtube.ts";

// A few real, caption-bearing videos (well-known, public). Override via env.
const DEFAULT_IDS = [
  "dQw4w9WgXcQ", // Rick Astley — Never Gonna Give You Up (has captions)
  "aircAruvnKk", // 3Blue1Brown — But what is a neural network?
];

const idsEnv = (process.env["YT_DLP_VERIFY_IDS"] ?? "").trim();
const ids = idsEnv
  ? idsEnv.split(",").map((s) => s.trim()).filter(Boolean)
  : DEFAULT_IDS;

if (process.env["ALLOW_DIRECT_YOUTUBE"] !== "1") {
  console.log("⚠  ALLOW_DIRECT_YOUTUBE is not 1 — set it to actually hit YouTube.");
}
if (!isYtDlpAvailable()) {
  console.log("✗ yt-dlp is not on PATH. Install with: pip install yt-dlp");
  process.exit(1);
}

const minGap = ytDlpMinGapMs();
console.log(`yt-dlp available · min-gap between invocations: ${minGap} ms`);
console.log(`videos: ${ids.join(", ")}\n`);

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

const t0 = Date.now();
// Fire ALL calls at once: the shared process gate must serialize them
// (concurrency 1) and space their execution by >= min-gap. We can't observe the
// gate's internal release from outside fetchYtDlpTranscript, so we measure
// RESOLUTION times — serialized + paced calls resolve >= min-gap apart, which is
// the externally observable proof that pacing held.
const results = await Promise.all(
  ids.map(async (id) => {
    const text = await fetchYtDlpTranscript(id);
    return { id, text, doneAt: Date.now() - t0 };
  }),
);

let pass = 0;
for (const { id, text } of results) {
  const words = wordCount(text);
  const found = words > 0;
  if (found) pass++;
  console.log(`=== ${id}`);
  console.log(`    captions found: ${found ? "yes" : "no"}`);
  console.log(`    words         : ${words.toLocaleString()}`);
}

const done = results.map((r) => r.doneAt).sort((a, b) => a - b);
const total = Date.now() - t0;
console.log(`\nresolution offsets (ms from t0, sorted): ${done.join(", ")}`);
let gapsOk = true;
for (let i = 1; i < done.length; i++) {
  const gap = done[i]! - done[i - 1]!;
  const ok = gap >= minGap;
  if (!ok) gapsOk = false;
  console.log(`    gap #${i}: ${gap} ms  ${ok ? "✓ >= min-gap" : "✗ UNDER min-gap"}`);
}
console.log(
  `total elapsed: ${total} ms for ${ids.length} calls (gate floor ≈ ${(ids.length - 1) * minGap} ms)`,
);
console.log(gapsOk ? "✓ min-gap honored between all invocations" : "✗ a gap fell under min-gap");
console.log(`${pass}/${ids.length} videos returned a real transcript via the paced yt-dlp path.`);
