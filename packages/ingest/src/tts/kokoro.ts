/**
 * Kokoro-82M text-to-speech synthesis (ONNX / CPU) for Read narration.
 *
 * Mirrors `whisper.ts`: lazy dynamic import of the model, a single cached
 * singleton, the same `.cache/transformers` cache dir, q8/cpu discipline, and
 * the same spawned-`ffmpeg` conventions (FFMPEG_PATH, hasFfmpeg()). This module
 * is the side-effectful half of the pipeline — it loads a model, allocates PCM,
 * spawns ffmpeg, and writes temp files. The pure prose-extraction lives in
 * `chunk.ts`.
 *
 * Compute budget (measured on Apple M-series, CPU-only, q8):
 *   - ~8–9 words/sec of synthesized speech. The flagship Read (~1,950 narratable
 *     words) is ~3.8 min of synthesis per voice; three voices ≈ 11–12 min total.
 *   - Model load is a one-time ~3–5s cost amortized across all paragraphs/voices.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Constants — named, documented, env-overridable (mirrors whisper.ts)
// ---------------------------------------------------------------------------

/**
 * Kokoro model ID. v1.0 ONNX community build, q8 — small, CPU-friendly, no GPU.
 * Env: KOKORO_MODEL_ID
 */
export const KOKORO_MODEL_ID =
  process.env["KOKORO_MODEL_ID"] ?? "onnx-community/Kokoro-82M-v1.0-ONNX";

/**
 * Model quantization dtype. q8 balances size and quality on CPU.
 * Env: KOKORO_DTYPE
 */
export const KOKORO_DTYPE =
  (process.env["KOKORO_DTYPE"] as "q8" | "q4" | "fp32" | "fp16") ?? "q8";

/** Kokoro output sample rate — fixed at 24kHz by the model. */
export const KOKORO_SAMPLE_RATE = 24000;

/**
 * Path to the ffmpeg binary. Falls back to system PATH.
 * Env: FFMPEG_PATH (shared with whisper.ts)
 */
export const FFMPEG_PATH = process.env["FFMPEG_PATH"] ?? "ffmpeg";

/** Audio container/codec for the final narration tracks. */
export type NarrationCodec = "mp3" | "opus";

/**
 * The codec for the final narration tracks. DEFAULT is `opus` (libopus, mono):
 * the smaller file — Opus is dramatically more efficient than MP3 for speech
 * (~½ the size), and that's what we ship. `mp3` (libmp3lame, mono) stays
 * selectable for broad-compat fallback. Env: NARRATION_CODEC = opus | mp3
 */
export const NARRATION_CODEC: NarrationCodec =
  process.env["NARRATION_CODEC"] === "mp3" ? "mp3" : "opus";

/**
 * MP3 encode bitrate. 64kbps mono is comfortable for speech and keeps files
 * small. Env: NARRATION_MP3_BITRATE
 */
export const MP3_BITRATE = process.env["NARRATION_MP3_BITRATE"] ?? "64k";

/**
 * Opus encode bitrate. 32kbps mono is transparent for narration speech.
 * Env: NARRATION_OPUS_BITRATE
 */
export const OPUS_BITRATE = process.env["NARRATION_OPUS_BITRATE"] ?? "32k";

/** File extension (no dot) for a codec. */
export function codecExtension(codec: NarrationCodec): string {
  return codec; // "mp3" | "opus" map 1:1 to their extensions
}

// ---------------------------------------------------------------------------
// ffmpeg helpers (mirror whisper.ts)
// ---------------------------------------------------------------------------

/** Return true if the `ffmpeg` binary is accessible. */
export function hasFfmpeg(): boolean {
  try {
    execFileSync(FFMPEG_PATH, ["-version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Lazy model singleton (mirrors whisper.ts's lazy import discipline)
// ---------------------------------------------------------------------------

/** Opaque Kokoro TTS instance type — we only call `.generate()` on it. */
export interface KokoroInstance {
  generate(
    text: string,
    opts: { voice: string; speed?: number },
  ): Promise<{ audio: Float32Array; sampling_rate: number }>;
}

let ttsSingleton: KokoroInstance | null = null;
let ttsPromise: Promise<KokoroInstance> | null = null;

/**
 * Load the Kokoro model once and cache it. Subsequent calls return the same
 * instance. Uses the SAME `.cache/transformers` cache dir as whisper.ts so the
 * two model families share one on-disk cache.
 */
export async function getTts(): Promise<KokoroInstance> {
  if (ttsSingleton) return ttsSingleton;
  if (ttsPromise) return ttsPromise;

  ttsPromise = (async () => {
    // Lazy import: keeps the module loadable in environments that never
    // synthesize (e.g. the chunker's unit tests).
    const { KokoroTTS } = await import("kokoro-js");
    const { env } = await import("@huggingface/transformers");
    env.cacheDir = join(process.cwd(), ".cache", "transformers");

    const tts = (await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
      dtype: KOKORO_DTYPE,
      device: "cpu",
    })) as unknown as KokoroInstance;

    ttsSingleton = tts;
    return tts;
  })();

  return ttsPromise;
}

// ---------------------------------------------------------------------------
// Synthesis
// ---------------------------------------------------------------------------

/**
 * Synthesize a single paragraph to 24kHz mono f32 PCM. One `generate()` call per
 * paragraph gives a clean prosody reset at each boundary (the model re-primes its
 * intonation per call) — better than streaming one giant string.
 *
 * @param tts   a `getTts()` instance (passed in so callers control the singleton)
 * @param text  clean narratable prose (already stripped of markup by chunk.ts)
 * @param voice Kokoro voice ID (e.g. "bm_fable")
 * @param speed optional speech-rate multiplier (1.0 = natural)
 */
export async function synthesizeParagraph(
  tts: KokoroInstance,
  text: string,
  { voice, speed }: { voice: string; speed?: number },
): Promise<Float32Array> {
  const result = await tts.generate(text, speed ? { voice, speed } : { voice });
  return result.audio;
}

/** Generate `ms` milliseconds of digital silence as 24kHz mono f32 samples. */
export function silenceSamples(ms: number): Float32Array {
  const n = Math.max(0, Math.round((ms / 1000) * KOKORO_SAMPLE_RATE));
  return new Float32Array(n); // zero-filled = silence
}

/**
 * Concatenate an ordered list of f32 PCM buffers into one contiguous buffer.
 * Used to splice paragraph audio + inter-paragraph silence into a single track.
 */
export function concatPcm(buffers: ReadonlyArray<Float32Array>): Float32Array {
  let total = 0;
  for (const b of buffers) total += b.length;
  const out = new Float32Array(total);
  let offset = 0;
  for (const b of buffers) {
    out.set(b, offset);
    offset += b.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Encoding (raw f32 PCM → MP3 via ffmpeg)
// ---------------------------------------------------------------------------

/** Write a 24kHz mono f32le PCM buffer to a temp `.pcm` file; returns the path. */
function writePcmTemp(pcm: Float32Array): string {
  const path = join(
    tmpdir(),
    `khazana-tts-${Date.now()}-${Math.random().toString(36).slice(2)}.pcm`,
  );
  // Float32Array → Buffer view over the same bytes (little-endian on all our targets).
  writeFileSync(path, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
  return path;
}

/**
 * Encode a 24kHz mono f32 PCM buffer to `outPath` via ffmpeg, with the given
 * ffmpeg audio codec + bitrate. Shared core for the MP3/Opus encoders. Throws if
 * ffmpeg fails. Cleans up the temp PCM file.
 */
function encodePcm(
  pcm: Float32Array,
  outPath: string,
  ffmpegCodec: string,
  bitrate: string,
  label: string,
): void {
  const pcmPath = writePcmTemp(pcm);
  try {
    const res = spawnSync(
      FFMPEG_PATH,
      [
        "-y",
        "-f", "f32le", // input: raw 32-bit float little-endian PCM
        "-ar", String(KOKORO_SAMPLE_RATE),
        "-ac", "1", // mono
        "-i", pcmPath,
        "-c:a", ffmpegCodec,
        "-b:a", bitrate,
        "-ac", "1", // mono output
        outPath,
      ],
      { stdio: "pipe" },
    );
    if (res.status !== 0) {
      const stderr = res.stderr ? res.stderr.toString() : "";
      throw new Error(`ffmpeg ${label} encode failed (status ${res.status}): ${stderr.slice(-500)}`);
    }
  } finally {
    if (existsSync(pcmPath)) try { unlinkSync(pcmPath); } catch {}
  }
}

/**
 * Encode a 24kHz mono f32 PCM buffer to an MP3 file (libmp3lame, mono,
 * MP3_BITRATE). MP3 gives the broadest browser compatibility (Safari included).
 */
export function encodePcmToMp3(pcm: Float32Array, outPath: string): void {
  encodePcm(pcm, outPath, "libmp3lame", MP3_BITRATE, "MP3");
}

/**
 * Encode a 24kHz mono f32 PCM buffer to an Opus (Ogg) file (libopus, mono,
 * OPUS_BITRATE). Smaller than MP3 for speech; Opus resamples to 48kHz internally
 * — the playback duration is unchanged.
 */
export function encodePcmToOpus(pcm: Float32Array, outPath: string): void {
  encodePcm(pcm, outPath, "libopus", OPUS_BITRATE, "Opus");
}

/**
 * Encode a 24kHz mono f32 PCM buffer to `outPath` using the given codec. `outPath`
 * should already carry the matching extension (`codecExtension(codec)`).
 */
export function encodePcmTo(
  pcm: Float32Array,
  outPath: string,
  codec: NarrationCodec,
): void {
  if (codec === "opus") encodePcmToOpus(pcm, outPath);
  else encodePcmToMp3(pcm, outPath);
}

/** Duration in seconds of a 24kHz mono PCM buffer. */
export function pcmDurationSec(pcm: Float32Array): number {
  return pcm.length / KOKORO_SAMPLE_RATE;
}
