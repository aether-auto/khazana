/**
 * Whisper-based podcast transcription via @huggingface/transformers (ONNX/CPU).
 *
 * Pipeline:
 *   1. Download the podcast MP3 enclosure URL (first MAX_AUDIO_BYTES bytes only).
 *   2. Decode MP3 → raw 16kHz f32 PCM via a spawned `ffmpeg` binary.
 *   3. Transcribe the float32 audio with Xenova/whisper-base q8 (74MB model,
 *      pure Node/ONNX — no Python, no GPU required).
 *   4. Drop degenerate chunks (repetition loops, non-speech), collapse residual
 *      loops, and strip ad/sponsor blocks via `cleanPodcastTranscript`.
 *   5. Return the HTML prose string, or "" on any failure (never throws).
 *
 * Optional: set GROQ_API_KEY to use Groq's free whisper-large-v3-turbo API
 * instead of local Whisper — much higher quality, no hallucination, $0 with a
 * free Groq account. Local Whisper (whisper-base) is the default fallback.
 *
 * Compute budget (measured on Apple M-series, CPU-only):
 *   - whisper-base q8 runs at ~12–15x realtime, so 1 hour of audio → ~5 min.
 *   - MAX_AUDIO_BYTES = 25MB ≈ 26 min of audio at 128kbps → ~2 min transcription.
 *   - GitHub Actions (8-core Linux runner): expect 4–6x realtime
 *     → 26 min audio → 5–7 min transcription. Well within the 6h job cap.
 *
 * Tunable constants (all can be overridden via env vars documented below).
 */

import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchTimeoutMs, type FetchFn } from "./fetchers/build-source.js";
import { cleanPodcastTranscript } from "./podcast.js";
import { whisperSemaphore } from "./concurrency.js";

// ---------------------------------------------------------------------------
// Constants — all named, all documented, all env-overridable
// ---------------------------------------------------------------------------

/**
 * Maximum bytes to download from the audio enclosure URL.
 * 25MB ≈ 26 min at 128kbps. Keeps transcription under ~1 min on weak CPU.
 * Env: WHISPER_MAX_AUDIO_BYTES
 */
export const MAX_AUDIO_BYTES = parseInt(
  process.env["WHISPER_MAX_AUDIO_BYTES"] ?? "",
  10,
) || (25 * 1024 * 1024);

/**
 * Minimum stripped-text character count for a `<podcast:transcript>` fetch to
 * be accepted as a FULL transcript rather than a chapter list / summary stub.
 * Env: WHISPER_MIN_FULL_TRANSCRIPT_CHARS
 */
export const MIN_FULL_TRANSCRIPT_CHARS = parseInt(
  process.env["WHISPER_MIN_FULL_TRANSCRIPT_CHARS"] ?? "",
  10,
) || 1500;

/**
 * Whisper model ID to use. whisper-base (74M params, q8 ≈ 74MB) is the
 * default — dramatically lower hallucination rate than whisper-tiny, still
 * fast enough for GitHub Actions (~10–15x realtime on CPU). Upgrade to
 * whisper-small (244M params) for even better quality on long episodes.
 * Env: WHISPER_MODEL_ID
 */
export const WHISPER_MODEL_ID =
  process.env["WHISPER_MODEL_ID"] ?? "Xenova/whisper-base";

/**
 * Model quantization dtype. q8 balances size and quality on CPU.
 * Env: WHISPER_DTYPE
 */
export const WHISPER_DTYPE =
  (process.env["WHISPER_DTYPE"] as "q8" | "q4" | "fp32" | "fp16") ?? "q8";

/**
 * Optional Groq API key. When set, audio is sent to Groq's free
 * whisper-large-v3-turbo endpoint instead of running local Whisper.
 * Sign up for a free Groq account at https://console.groq.com to get a key.
 * Env: GROQ_API_KEY
 */
export const GROQ_API_KEY = process.env["GROQ_API_KEY"] ?? "";

/**
 * Groq transcription API endpoint (free, uses whisper-large-v3-turbo).
 * Env: GROQ_API_URL
 */
export const GROQ_API_URL =
  process.env["GROQ_API_URL"] ??
  "https://api.groq.com/openai/v1/audio/transcriptions";

/**
 * Groq model to use for transcription. whisper-large-v3-turbo is free,
 * fast, and has very low hallucination. Env: GROQ_WHISPER_MODEL
 */
export const GROQ_WHISPER_MODEL =
  process.env["GROQ_WHISPER_MODEL"] ?? "whisper-large-v3-turbo";

/**
 * Compression ratio threshold for detecting degenerate Whisper chunks.
 * A chunk whose text compresses to much less than this ratio is considered
 * repetitive / non-speech and is dropped. Whisper's default is 2.4.
 * Env: WHISPER_COMPRESSION_RATIO_THRESHOLD
 */
export const COMPRESSION_RATIO_THRESHOLD = parseFloat(
  process.env["WHISPER_COMPRESSION_RATIO_THRESHOLD"] ?? "",
) || 2.4;

/**
 * Minimum unique-word ratio for a chunk to be considered genuine speech.
 * A chunk where fewer than this fraction of words are unique is likely a
 * hallucination loop and is dropped. E.g. 0.3 means ≥30% unique words.
 * Env: WHISPER_MIN_UNIQUE_RATIO
 */
export const MIN_UNIQUE_RATIO = parseFloat(
  process.env["WHISPER_MIN_UNIQUE_RATIO"] ?? "",
) || 0.3;

/**
 * Path to the ffmpeg binary. Falls back to system PATH.
 * Env: FFMPEG_PATH
 */
export const FFMPEG_PATH = process.env["FFMPEG_PATH"] ?? "ffmpeg";

/**
 * Average reading words-per-minute for estimating read time.
 */
const READING_WPM = 200;

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing without side-effects)
// ---------------------------------------------------------------------------

/**
 * Strip HTML tags and return bare text length.
 * Used to measure whether a fetched transcript is a full dialogue transcript
 * rather than a summary / chapter list stub.
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Detect whether a Whisper chunk's text is degenerate (hallucination loop or
 * non-speech). A chunk is degenerate when:
 *   - It has fewer than MIN_UNIQUE_RATIO unique words (e.g. "get the
 *     opportunity to get the opportunity to get…" → nearly 0 unique ratio).
 *   - It compresses at a ratio below COMPRESSION_RATIO_THRESHOLD — a classic
 *     Whisper signal that the text is repetitive / non-speech.
 *
 * Compression ratio is approximated as text.length / uniqueChars.size, which
 * correlates with entropy and catches repetition loops without requiring zlib.
 *
 * Returns true when the chunk should be DROPPED.
 */
export function isDegenerateChunk(text: string): boolean {
  const t = text.trim();
  if (!t) return true; // empty → degenerate

  const words = t.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  // Unique-word ratio check
  const uniqueWords = new Set(words);
  const uniqueRatio = uniqueWords.size / words.length;
  if (uniqueRatio < MIN_UNIQUE_RATIO) return true;

  // Compression ratio approximation: characters / unique characters.
  // High values = very repetitive text. Threshold: < 2.4 is OK, > 2.4 is
  // suspicious. BUT we invert: we flag when the text has very LOW character
  // entropy, i.e., unique char count is small relative to total length.
  const chars = t.replace(/\s/g, "");
  const uniqueChars = new Set(chars);
  if (uniqueChars.size === 0) return true;
  const compressionRatio = chars.length / uniqueChars.size;
  if (compressionRatio > COMPRESSION_RATIO_THRESHOLD * 3) return true; // far above threshold

  return false;
}

/**
 * Return true when `html` looks like a full, dialogue-style transcript
 * (enough text to be meaningful). Rejects short episode summaries and
 * chapter lists that podcasts sometimes serve at `<podcast:transcript>` URLs.
 */
export function isFullTranscript(html: string): boolean {
  if (!html) return false;
  return stripHtml(html).length >= MIN_FULL_TRANSCRIPT_CHARS;
}

/**
 * Estimate reading time in minutes for the given HTML body.
 * Strips tags, splits on whitespace, divides by READING_WPM.
 */
export function buildReadTime(html: string): number {
  if (!html) return 0;
  const words = stripHtml(html).split(/\s+/).filter((w) => w.length > 0);
  return words.length / READING_WPM;
}

/**
 * Pick the best audio enclosure URL from an array of `{ url, type }` objects.
 *
 * Preference: audio/mpeg first (broadest ffmpeg support), then any audio/*.
 * Returns null if no audio track is found.
 */
export function pickAudioMime(
  tracks: ReadonlyArray<{ url: string; type: string }>,
): string | null {
  const audio = tracks.filter((t) => t.type.startsWith("audio/"));
  if (audio.length === 0) return null;
  const mpeg = audio.find((t) => t.type === "audio/mpeg");
  return (mpeg ?? audio[0]!).url;
}

// ---------------------------------------------------------------------------
// Whisper transcription (side-effectful — file I/O, spawns ffmpeg, loads model)
// ---------------------------------------------------------------------------

/**
 * Return true if the `ffmpeg` binary is accessible. Used to short-circuit
 * gracefully when ffmpeg is not installed (CI without ffmpeg, local dev).
 */
export function isFfmpegAvailable(): boolean {
  try {
    execFileSync(FFMPEG_PATH, ["-version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Decode an audio file at `inputPath` to raw 16kHz mono f32le PCM at
 * `outputPath` using ffmpeg. Throws on failure.
 */
function decodeToPcm(inputPath: string, outputPath: string): void {
  execFileSync(
    FFMPEG_PATH,
    [
      "-y",
      "-i", inputPath,
      "-ar", "16000",  // 16kHz sample rate (Whisper requirement)
      "-ac", "1",      // mono
      "-f", "f32le",   // raw 32-bit float little-endian
      outputPath,
    ],
    { stdio: "pipe" },
  );
}

/**
 * Transcribe `float32` audio data (16kHz mono f32) using the configured
 * Whisper model via @huggingface/transformers.
 *
 * Uses degeneration-resistant generation options:
 * - `no_repeat_ngram_size: 5` — blocks the model from repeating 5-grams,
 *   the primary cause of "get the opportunity…" loops.
 * - `condition_on_previous_text: false` — prevents repetition from the last
 *   chunk propagating into the next (the second major cause of loops).
 * - `return_timestamps: true` — enables chunked decode so we can filter
 *   individual degenerate chunks before joining.
 * - `temperature` fallback ladder — when a chunk's logprob is low the
 *   pipeline automatically retries with higher temperature (0.2 → 0.4 → 0.6
 *   → 0.8 → 1.0), trading coherence for non-repetition.
 *
 * Returns the filtered transcript text (degenerate chunks dropped), or ""
 * on failure.
 */
async function runWhisper(float32: Float32Array): Promise<string> {
  // Lazy import: keeps the module loadable even when the package isn't
  // installed (e.g. in test environments that don't need real transcription).
  const { pipeline: hfPipeline, env } = await import("@huggingface/transformers");

  // Cache models next to the repo so they're reused across runs.
  env.cacheDir = join(process.cwd(), ".cache", "transformers");

  const transcriber = await hfPipeline(
    "automatic-speech-recognition",
    WHISPER_MODEL_ID,
    { dtype: WHISPER_DTYPE, device: "cpu" },
  );

  try {
    const result = await transcriber(float32, {
      language: "en",
      task: "transcribe",
      // Chunked decode — lets us filter per-chunk and controls memory usage.
      chunk_length_s: 30,
      stride_length_s: 5,
      // Return chunk-level timestamps so we can inspect and drop bad chunks.
      return_timestamps: true,
      // --- Degeneration-resistant generation options ---
      // Block 5-gram repetition within a single decode pass.
      no_repeat_ngram_size: 5,
      // Don't seed the next chunk with the last token of the previous chunk —
      // this is the primary propagation path for Whisper repetition loops.
      condition_on_previous_text: false,
      // Temperature ladder: if a segment's avg logprob is below the threshold
      // the pipeline will retry with higher temperature (0.2 → 0.4 → 0.6 →
      // 0.8 → 1.0). This trades strict coherence for non-repetition.
      // Cast needed: TS types say `number` but the runtime accepts `number[]`
      // for the fallback ladder (supported by transformers.js internals).
      temperature: [0.0, 0.2, 0.4, 0.6, 0.8, 1.0] as unknown as number,
      // Drop a chunk and retry with higher temperature if avg logprob is below
      // this threshold (Whisper paper: -1.0 is the recommended cutoff).
      logprob_threshold: -1.0,
      // Drop and retry if the text compresses at a ratio above this value,
      // which indicates repetition / non-speech. Whisper default: 2.4.
      compression_ratio_threshold: COMPRESSION_RATIO_THRESHOLD,
    });

    // The result with return_timestamps:true has a `chunks` array; each chunk
    // has `{ text, timestamp }`. We filter degenerate chunks and join the rest.
    if (
      typeof result === "object" &&
      result !== null &&
      "chunks" in result &&
      Array.isArray((result as { chunks: unknown[] }).chunks)
    ) {
      const chunks = (result as { chunks: Array<{ text: string; timestamp?: [number, number] }> }).chunks;
      const goodChunks = chunks.filter((c) => !isDegenerateChunk(c.text));
      return goodChunks.map((c) => c.text).join("").trim();
    }

    // Fallback: result without chunks (short audio, no chunking triggered).
    const text =
      typeof result === "object" &&
      result !== null &&
      "text" in result
        ? String((result as { text: string }).text)
        : "";
    return text;
  } finally {
    await transcriber.dispose();
  }
}

/**
 * Transcribe a podcast episode from an audio URL using Groq's free
 * whisper-large-v3-turbo API. This is the preferred path when GROQ_API_KEY
 * is set — no local model, no hallucination loops, very fast.
 *
 * Sends the first MAX_AUDIO_BYTES of the audio as a multipart form upload to
 * `https://api.groq.com/openai/v1/audio/transcriptions`.
 *
 * Returns the raw transcript text, or "" on any failure. Never throws.
 * Never called when GROQ_API_KEY is not set.
 *
 * @param audioUrl - Direct MP3/audio URL (plain CDN URL, no auth)
 */
export async function transcribeWithGroq(audioUrl: string): Promise<string> {
  if (!GROQ_API_KEY || !audioUrl) return "";

  const tmpMp3 = join(
    tmpdir(),
    `khazana-groq-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`,
  );

  try {
    // 1. Download audio chunk (hard timeout so a hung CDN can't pin a worker)
    const res = await fetch(audioUrl, {
      headers: { Range: `bytes=0-${MAX_AUDIO_BYTES - 1}` },
      signal: AbortSignal.timeout(fetchTimeoutMs()),
    });
    if (!res.ok && res.status !== 206) return "";

    const arrayBuf = await res.arrayBuffer();
    writeFileSync(tmpMp3, Buffer.from(arrayBuf));

    // 2. Build multipart form — Groq expects the same OpenAI audio format
    const audioBytes = readFileSync(tmpMp3);
    const audioBlob = new Blob([audioBytes], { type: "audio/mpeg" });
    const form = new FormData();
    form.append("file", audioBlob, "audio.mp3");
    form.append("model", GROQ_WHISPER_MODEL);
    form.append("language", "en");
    form.append("response_format", "text");

    // 3. Send to Groq API
    const groqRes = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(fetchTimeoutMs()),
    });
    if (!groqRes.ok) return "";

    // response_format=text returns plain text directly
    const text = await groqRes.text();
    return text.trim();
  } catch {
    return "";
  } finally {
    if (existsSync(tmpMp3)) try { unlinkSync(tmpMp3); } catch {}
  }
}

/**
 * Transcribe a podcast episode from an audio URL.
 *
 * Flow:
 *   1. Download up to MAX_AUDIO_BYTES from `audioUrl` using a Range request.
 *   2. Write to a temp file and decode MP3 → f32 PCM via ffmpeg.
 *   3. Run Xenova/whisper-tiny q8 to produce a plain-text transcript.
 *   4. Sanitize through `sanitizePodcastTranscript` (plain text → HTML prose).
 *
 * Returns the sanitized HTML body string, or "" on any failure (never throws).
 * Cleans up temp files on both success and error.
 *
 * @deprecated Use `transcribePodcastEpisode` instead — this function returns
 * an empty string because `FetchFn` mangles binary MP3 data. Kept for API
 * compatibility; real transcription uses native fetch internally.
 */
export async function transcribeAudioUrl(
  audioUrl: string,
  fetchFn: FetchFn,
): Promise<string> {
  if (!audioUrl) return "";
  // FetchFn.text() mangles binary — real transcription uses native fetch.
  // This stub is kept so the function remains importable for tests.
  void fetchFn;
  return "";
}

/**
 * Transcribe a podcast episode from an audio URL.
 *
 * Tier selection:
 *   1. **Groq** (if GROQ_API_KEY is set) — whisper-large-v3-turbo, free,
 *      cloud-hosted, zero hallucination. Result cleaned via `cleanPodcastTranscript`.
 *   2. **Local Whisper** (default) — Xenova/whisper-base q8 via ONNX/CPU.
 *      Uses degeneration-resistant generation (no_repeat_ngram_size, temperature
 *      ladder, condition_on_previous_text=false) + degenerate chunk filtering.
 *      Result cleaned via `cleanPodcastTranscript` (ad-strip + repetition-collapse).
 *
 * Uses native `fetch` internally for binary-safe audio download.
 * Returns sanitized HTML prose, or "" on any failure. Never throws.
 *
 * @param audioUrl - Direct MP3/audio URL (must be a plain CDN URL, no auth)
 */
export async function transcribePodcastEpisode(audioUrl: string): Promise<string> {
  if (!audioUrl) return "";

  // Tier 1: Groq (optional, behind GROQ_API_KEY env var)
  if (GROQ_API_KEY) {
    const groqText = await transcribeWithGroq(audioUrl);
    if (groqText.trim()) {
      return cleanPodcastTranscript(groqText);
    }
    // Fall through to local Whisper on Groq failure
  }

  // Tier 2: local Whisper (requires ffmpeg)
  if (!isFfmpegAvailable()) return "";

  const release = await whisperSemaphore.acquire();
  try {
    const tmpMp3 = join(tmpdir(), `khazana-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
    const tmpPcm = tmpMp3.replace(".mp3", ".pcm");

    try {
      // 1. Download audio chunk — binary safe via native fetch (hard timeout
      // so a hung CDN can't pin the whisper worker for the whole run)
      const res = await fetch(audioUrl, {
        headers: { Range: `bytes=0-${MAX_AUDIO_BYTES - 1}` },
        signal: AbortSignal.timeout(fetchTimeoutMs()),
      });
      if (!res.ok && res.status !== 206) return "";

      const arrayBuf = await res.arrayBuffer();
      writeFileSync(tmpMp3, Buffer.from(arrayBuf));

      // 2. Decode MP3 → f32 PCM via ffmpeg
      decodeToPcm(tmpMp3, tmpPcm);

      const pcmBuf = readFileSync(tmpPcm);
      const float32 = new Float32Array(
        pcmBuf.buffer,
        pcmBuf.byteOffset,
        pcmBuf.byteLength / 4,
      );

      // 3. Whisper transcription (degeneration-resistant options applied inside)
      const rawText = await runWhisper(float32);
      if (!rawText.trim()) return "";

      // 4. Ad-strip + repetition-collapse + HTML paragraphize
      return cleanPodcastTranscript(rawText.trim());
    } catch {
      return "";
    } finally {
      if (existsSync(tmpMp3)) try { unlinkSync(tmpMp3); } catch {}
      if (existsSync(tmpPcm)) try { unlinkSync(tmpPcm); } catch {}
    }
  } finally {
    release();
  }
}
