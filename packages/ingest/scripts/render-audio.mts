/**
 * Build-time narration render CLI.
 *
 * Reads every Read in the site's blog content collection, extracts its
 * narratable prose, and renders EXACTLY ONE audio track (chosen by the Read's
 * channels) plus a manifest into the site's `public/audio/reads/` directory
 * (deploy-not-commit; gitignored). The track codec defaults to MP3 (universal
 * browser compat, Safari included); set `NARRATION_CODEC=opus` for Opus.
 *
 * Voice policy (one voice per Read): a story/narrative channel (history,
 * geopolitics, politics, geography) → `bm_fable`; everything else → `am_onyx`
 * (the default). `NARRATION_VOICES` can override the selection for ALL Reads.
 *
 * Usage (from repo root):
 *   pnpm --filter @khazana/ingest exec tsx scripts/render-audio.mts
 *
 * Environment:
 *   NARRATION_VOICES      comma-separated voice IDs — OVERRIDE the channel policy
 *                         for every Read (default: per-Read channel selection)
 *   NARRATION_CODEC       mp3 (DEFAULT) | opus — output codec/extension
 *   NARRATION_LIMIT_PARAS cap paragraphs per Read (quick validation runs)
 *   NARRATION_OUT_DIR     override output dir (default: apps/site/public/audio/reads)
 *   NARRATION_BLOG_DIR    override blog content dir
 *   FFMPEG_PATH           ffmpeg binary (required; encoding is mandatory)
 *
 * This is what the ORCHESTRATOR runs for the full render.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderNarration } from "../src/tts/render.js";
import { frontmatterChannels } from "../src/tts/chunk.js";
import { voiceForChannels } from "../src/tts/voices.js";
import { NARRATION_CODEC } from "../src/tts/kokoro.js";

// Resolve repo paths relative to this script, so cwd doesn't matter.
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", ".."); // packages/ingest/scripts → repo root

const BLOG_DIR =
  process.env["NARRATION_BLOG_DIR"] ??
  join(repoRoot, "apps", "site", "src", "content", "blog");

const OUT_DIR =
  process.env["NARRATION_OUT_DIR"] ??
  join(repoRoot, "apps", "site", "public", "audio", "reads");

/**
 * Optional voice override (comma-separated). When set, EVERY Read renders with
 * these voices instead of the channel-derived one. When unset, the voice is
 * chosen per Read by `voiceForChannels`.
 */
const voiceOverride = (() => {
  const env = process.env["NARRATION_VOICES"]?.trim();
  if (!env) return null;
  return env.split(",").map((v) => v.trim()).filter(Boolean);
})();

const limitParas = (() => {
  const env = process.env["NARRATION_LIMIT_PARAS"]?.trim();
  if (!env) return undefined;
  const n = parseInt(env, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
})();

/** Slug a Read by its filename (matches Astro's default content slug). */
function slugOf(file: string): string {
  return basename(file, extname(file));
}

async function main(): Promise<void> {
  const files = readdirSync(BLOG_DIR).filter(
    (f) => f.endsWith(".mdx") || f.endsWith(".md"),
  );

  if (files.length === 0) {
    console.warn(`[tts] no Reads found in ${BLOG_DIR}`);
    return;
  }

  console.log(
    `[tts] rendering ${files.length} Read(s), one voice each` +
      (voiceOverride ? ` (voice override: ${voiceOverride.join(", ")})` : " (channel-selected)") +
      ` [codec: ${NARRATION_CODEC}]` +
      (limitParas ? ` (limit ${limitParas} paras)` : "") +
      `\n[tts] out: ${OUT_DIR}`,
  );

  const t0 = Date.now();
  for (const file of files) {
    const raw = readFileSync(join(BLOG_DIR, file), "utf8");
    const slug = slugOf(file);

    // One voice per Read: channel-derived unless explicitly overridden.
    const channels = frontmatterChannels(raw);
    const voices = voiceOverride ?? [voiceForChannels(channels)];
    console.log(
      `[tts] ${slug}: channels=[${channels.join(", ")}] → voice ${voices.join(", ")}`,
    );

    await renderNarration({ slug, raw, voices, outDir: OUT_DIR, limitParas });
  }
  console.log(`[tts] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error("[tts] render failed:", err);
  process.exitCode = 1;
});
