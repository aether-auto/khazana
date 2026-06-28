/**
 * Orchestrated narration render: raw Read source → one audio track per requested
 * voice + a `NarrationManifest` that the audio player consumes.
 *
 * Policy is ONE voice per Read (chosen by channel via `voiceForChannels` in the
 * caller), so the manifest's `tracks[]` normally holds a single entry. The render
 * loop still supports N voices, but the channel policy drives a single track.
 *
 * For each voice we synthesize every narratable paragraph (one `generate()` call
 * each for clean prosody resets), splice the paragraph PCM together with the
 * pacing silences from `chunk.ts`, encode the whole thing to a single mono track
 * in the configured codec (default Opus — the smaller file; MP3 fallback available
 * via `NARRATION_CODEC`), and record each paragraph's start time
 * within that final track. The manifest's `paragraphs[]` order/indices are
 * identical to
 * `narratableParagraphs()` order — the Read page emits `data-para-index` in the
 * same prose order, so the player can highlight the spoken paragraph from
 * `startSec`.
 *
 * Idempotent: if a manifest already exists for the same `bodyHash` and all track
 * files are present, the render is skipped.
 */

import { createHash } from "node:crypto";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  narratableParagraphs,
  pacingPlan,
  type NarratableParagraph,
} from "./chunk.js";
import {
  getTts,
  synthesizeParagraph,
  silenceSamples,
  concatPcm,
  encodePcmTo,
  codecExtension,
  pcmDurationSec,
  hasFfmpeg,
  KOKORO_SAMPLE_RATE,
  NARRATION_CODEC,
  type NarrationCodec,
} from "./kokoro.js";
import { findVoice } from "./voices.js";

// ---------------------------------------------------------------------------
// Manifest contract (matches the audio player's expectations)
// ---------------------------------------------------------------------------

/** One selectable narration track (one voice rendering of the whole Read). */
export interface NarrationTrack {
  /** Kokoro voice ID. */
  voice: string;
  /** Human-readable label for the picker. */
  label: string;
  /** Web path to the track, e.g. `/audio/reads/<slug>.<voice>.mp3` (or `.opus`). */
  src: string;
  /** Total duration of the track in seconds. */
  durationSec: number;
}

/** A paragraph's start offset within every track (tracks are time-aligned). */
export interface ParagraphMark {
  /** Prose-paragraph index, matching `narratableParagraphs()` order. */
  index: number;
  /** Start time of this paragraph within the audio, in seconds. */
  startSec: number;
}

/** The narration manifest written next to the audio for a single Read. */
export interface NarrationManifest {
  slug: string;
  /** sha1 of the raw source — lets the render skip when nothing changed. */
  bodyHash: string;
  tracks: NarrationTrack[];
  paragraphs: ParagraphMark[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** sha1 of the raw Read source — the idempotency key. */
export function bodyHashOf(raw: string): string {
  return createHash("sha1").update(raw, "utf8").digest("hex");
}

/** Web path the site serves a track from (manifest `src`). */
function trackWebPath(slug: string, voice: string, codec: NarrationCodec): string {
  return `/audio/reads/${slug}.${voice}.${codecExtension(codec)}`;
}

/** Disk path for a track file inside `outDir`. */
function trackDiskPath(
  outDir: string,
  slug: string,
  voice: string,
  codec: NarrationCodec,
): string {
  return join(outDir, `${slug}.${voice}.${codecExtension(codec)}`);
}

/** Disk path for the manifest inside `outDir`. */
function manifestDiskPath(outDir: string, slug: string): string {
  return join(outDir, `${slug}.manifest.json`);
}

/**
 * Resolve a requested voice ID to its cast entry's label (falls back to the raw
 * voice ID if the voice isn't in the curated cast).
 */
function labelFor(voice: string): string {
  return findVoice(voice)?.label ?? voice;
}

/** True when a previously-written manifest is still valid (same hash, files present). */
function isUpToDate(
  outDir: string,
  slug: string,
  bodyHash: string,
  voices: ReadonlyArray<string>,
  codec: NarrationCodec,
): NarrationManifest | null {
  const mPath = manifestDiskPath(outDir, slug);
  if (!existsSync(mPath)) return null;
  try {
    const existing = JSON.parse(readFileSync(mPath, "utf8")) as NarrationManifest;
    if (existing.bodyHash !== bodyHash) return null;
    // Every requested voice must already have a present track file in this codec.
    for (const v of voices) {
      if (!existing.tracks.some((t) => t.voice === v)) return null;
      if (!existsSync(trackDiskPath(outDir, slug, v, codec))) return null;
    }
    return existing;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export interface RenderOptions {
  slug: string;
  /** Raw Read source (MDX/Markdown). */
  raw: string;
  /** Voice IDs to render (defaults handled by the caller / script). */
  voices: ReadonlyArray<string>;
  /** Directory to write `<slug>.<voice>.<ext>` + `<slug>.manifest.json` into. */
  outDir: string;
  /** Audio codec (default: `NARRATION_CODEC`, i.e. opus unless overridden). */
  codec?: NarrationCodec;
  /**
   * Optional cap on the number of paragraphs to render (quick validation runs).
   * When set, only the first N narratable paragraphs are synthesized.
   */
  limitParas?: number;
  /** Optional logger (defaults to console.log). Pass a no-op to silence. */
  log?: (msg: string) => void;
}

/**
 * Render narration for one Read across one or more voices, writing audio tracks
 * (in the configured codec) and a manifest into `outDir`. Returns the manifest.
 * Idempotent on `bodyHash`.
 *
 * Throws if ffmpeg is unavailable (encoding is mandatory) or if no narratable
 * prose is found.
 */
export async function renderNarration(
  opts: RenderOptions,
): Promise<NarrationManifest> {
  const { slug, raw, voices, outDir } = opts;
  const codec: NarrationCodec = opts.codec ?? NARRATION_CODEC;
  const log = opts.log ?? ((m: string) => console.log(m));

  if (!hasFfmpeg()) {
    throw new Error(
      "ffmpeg not found — narration encoding requires ffmpeg on PATH (set FFMPEG_PATH).",
    );
  }
  if (voices.length === 0) throw new Error("renderNarration: no voices requested.");

  const bodyHash = bodyHashOf(raw);

  // Idempotent skip: manifest exists, same hash, all requested track files present.
  const upToDate = isUpToDate(outDir, slug, bodyHash, voices, codec);
  if (upToDate) {
    log(`[tts] ${slug}: up to date (bodyHash ${bodyHash.slice(0, 12)}) — skipping.`);
    return upToDate;
  }

  // Extract narratable prose (shared across all voices — same paragraph set).
  let paragraphs: NarratableParagraph[] = narratableParagraphs(raw);
  if (opts.limitParas !== undefined) {
    paragraphs = paragraphs.slice(0, opts.limitParas);
  }
  if (paragraphs.length === 0) {
    throw new Error(`renderNarration: no narratable prose for slug "${slug}".`);
  }
  const pacing = pacingPlan(paragraphs); // ms of silence AFTER each paragraph

  mkdirSync(outDir, { recursive: true });

  const tts = await getTts();
  const tracks: NarrationTrack[] = [];
  // The manifest carries ONE canonical `paragraphs[]` mark set, taken from the
  // first requested voice (by convention the default voice). All voices narrate
  // the same paragraph set with the same pacing, but spoken durations differ per
  // voice, so absolute start times are only exact for that reference track. The
  // player highlights by paragraph and re-seeks by paragraph INDEX on a voice
  // switch (not by absolute time), so per-track timing drift never desyncs the
  // highlight — it only affects the initial seek granularity of non-default
  // voices, which the player corrects on the next paragraph boundary.
  let paragraphMarks: ParagraphMark[] = [];

  for (let vi = 0; vi < voices.length; vi++) {
    const voice = voices[vi]!;
    const label = labelFor(voice);
    const t0 = Date.now();

    const segments: Float32Array[] = [];
    const marks: ParagraphMark[] = [];
    let cumulativeSamples = 0;

    for (let pi = 0; pi < paragraphs.length; pi++) {
      const para = paragraphs[pi]!;

      // Record this paragraph's start BEFORE appending its audio.
      marks.push({
        index: para.index,
        startSec: round3(cumulativeSamples / KOKORO_SAMPLE_RATE),
      });

      const pcm = await synthesizeParagraph(tts, para.text, { voice });
      segments.push(pcm);
      cumulativeSamples += pcm.length;

      // Inter-paragraph silence (not after the final paragraph).
      const gapMs = pacing[pi] ?? 0;
      if (pi < paragraphs.length - 1 && gapMs > 0) {
        const sil = silenceSamples(gapMs);
        segments.push(sil);
        cumulativeSamples += sil.length;
      }
    }

    const full = concatPcm(segments);
    const diskPath = trackDiskPath(outDir, slug, voice, codec);
    encodePcmTo(full, diskPath, codec);

    const durationSec = round3(pcmDurationSec(full));
    tracks.push({ voice, label, src: trackWebPath(slug, voice, codec), durationSec });

    if (vi === 0) paragraphMarks = marks;

    const elapsed = (Date.now() - t0) / 1000;
    const words = paragraphs.reduce((n, p) => n + p.text.split(/\s+/).length, 0);
    log(
      `[tts] ${slug} · ${voice} (${label}): ${paragraphs.length} paras, ` +
        `${durationSec.toFixed(1)}s audio in ${elapsed.toFixed(1)}s ` +
        `(${(words / elapsed).toFixed(1)} wps) → ${diskPath}`,
    );
  }

  const manifest: NarrationManifest = {
    slug,
    bodyHash,
    tracks,
    paragraphs: paragraphMarks,
  };
  writeFileSync(manifestDiskPath(outDir, slug), JSON.stringify(manifest, null, 2) + "\n");
  log(`[tts] ${slug}: wrote manifest (${tracks.length} tracks, ${paragraphMarks.length} paragraph marks).`);

  return manifest;
}

/** Round to 3 decimal places (ms precision for audio time marks). */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
