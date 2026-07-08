import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FetchFn } from "./fetchers/build-source.js";
import { fetchProxyTranscript } from "./youtube-proxy.js";
import { sanitizePodcastTranscript } from "./podcast.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Approximate characters per paragraph when splitting a long transcript
 * into readable prose paragraphs.
 */
const PARAGRAPH_CHARS = 500;

// ---------------------------------------------------------------------------
// Low-level XML helpers (kept for XML timedtext fallback path)
// ---------------------------------------------------------------------------

/** Decode the handful of XML/HTML entities the timedtext feed emits. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;#39;|&#39;/g, "'")
    .replace(/&amp;quot;|&quot;/g, '"')
    .replace(/&amp;lt;|&lt;/g, "<")
    .replace(/&amp;gt;|&gt;/g, ">")
    .replace(/&amp;|&amp;amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

/**
 * Parse the YouTube `timedtext` transcript XML into a single plain-text string.
 * Cues look like `<text start="0" dur="1.5">line</text>`. Pure/offline.
 */
export function parseTranscriptXml(xml: string): string {
  if (!xml) return "";
  const cues: string[] = [];
  const re = /<text\b[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const raw = m[1] ?? "";
    // Cue bodies are themselves entity-encoded; strip any stray tags first.
    const line = decodeEntities(raw.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (line) cues.push(line);
  }
  return cues.join(" ").trim();
}

// ---------------------------------------------------------------------------
// json3 timedtext parsing
// ---------------------------------------------------------------------------

/** Shape of a single event in the json3 timedtext format. */
interface Json3Event {
  segs?: Array<{ utf8?: string }>;
}

/**
 * Parse YouTube's `fmt=json3` timedtext JSON into plain text.
 * Each event has a `segs` array with `utf8` text chunks.
 * Pure/offline; returns "" on malformed input.
 */
export function parseTranscriptJson3(json: string): string {
  if (!json) return "";
  try {
    const data = JSON.parse(json) as { events?: Json3Event[] };
    const events = data.events ?? [];
    const cues: string[] = [];
    for (const ev of events) {
      const text = (ev.segs ?? [])
        .map((s) => s.utf8 ?? "")
        .join("")
        .replace(/\n/g, " ")
        .trim();
      if (text && text !== "\n") cues.push(text);
    }
    return cues.join(" ").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// ytInitialPlayerResponse extraction
// ---------------------------------------------------------------------------

/** A caption track entry from ytInitialPlayerResponse. */
interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
  name?: { simpleText?: string };
}

/** Shape of the playerCaptionsTracklistRenderer we care about. */
interface CaptionTracklist {
  captionTracks?: CaptionTrack[];
}

/** Minimal shape of ytInitialPlayerResponse we read. */
interface PlayerResponse {
  captions?: {
    playerCaptionsTracklistRenderer?: CaptionTracklist;
  };
  playabilityStatus?: {
    status?: string;
  };
}

/**
 * Extract the `ytInitialPlayerResponse` JSON object embedded in a YouTube
 * watch-page HTML string. Returns null on any parse failure.
 *
 * YouTube embeds the object as:
 *   var ytInitialPlayerResponse = {...};
 * The JSON value is delimited by the next top-level `};` boundary.
 */
export function extractPlayerResponse(html: string): PlayerResponse | null {
  if (!html) return null;
  const marker = "ytInitialPlayerResponse = ";
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const jsonStart = start + marker.length;

  // Walk forward to find the balanced closing `}` for the top-level object.
  let depth = 0;
  let i = jsonStart;
  let inString = false;
  let escape = false;

  while (i < html.length) {
    const ch = html[i]!;
    if (escape) {
      escape = false;
    } else if (ch === "\\" && inString) {
      escape = true;
    } else if (ch === '"' && !escape) {
      inString = !inString;
    } else if (!inString) {
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    i++;
  }

  const jsonStr = html.slice(jsonStart, i);
  try {
    return JSON.parse(jsonStr) as PlayerResponse;
  } catch {
    return null;
  }
}

/**
 * Extract the INNERTUBE_API_KEY embedded in a YouTube watch-page HTML string.
 * Returns null if not found.
 */
export function extractInnertubeApiKey(html: string): string | null {
  const m = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/);
  return m?.[1] ?? null;
}

/**
 * Pick the best caption track from a tracklist, preferring English manual
 * captions, then any English-tagged track, then the first track.
 */
export function pickCaptionTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (tracks.length === 0) return null;
  // Prefer English manual captions (kind is absent or "standard").
  const enManual = tracks.find(
    (t) => t.languageCode.startsWith("en") && (!t.kind || t.kind === "asr"),
  );
  if (enManual) return enManual;
  // Any English track (auto-generated asr is fine).
  const en = tracks.find((t) => t.languageCode.startsWith("en"));
  if (en) return en;
  // Fallback to the first available track.
  return tracks[0] ?? null;
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/** Extract the 11-char video id from a watch / youtu.be / embed URL. */
export function youTubeVideoId(url: string): string | null {
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/embed\/([A-Za-z0-9_-]{11})/,
    /\/shorts\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

/**
 * Wrap transcript plain text into readable prose HTML for `body`.
 * Splits long text at sentence boundaries into ~PARAGRAPH_CHARS-character paragraphs.
 */
export function transcriptToHtml(text: string): string {
  const t = text.trim();
  if (!t) return "";

  if (t.length <= PARAGRAPH_CHARS) {
    return `<p>${t}</p>`;
  }

  // Split into sentences, then group into ~500-char paragraphs.
  // Sentence boundary: period/exclamation/question followed by space or end.
  const sentences = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  const paragraphs: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current.length > 0 && current.length + sentence.length + 1 > PARAGRAPH_CHARS) {
      paragraphs.push(current.trim());
      current = sentence;
    } else {
      current = current.length > 0 ? `${current} ${sentence}` : sentence;
    }
  }
  if (current.trim()) paragraphs.push(current.trim());

  return paragraphs.map((p) => `<p>${p}</p>`).join("");
}

/**
 * Result from `fetchYouTubeTranscriptResult` — tells the caller whether the body is
 * a real transcript or nothing was found. The `description-fallback` kind has been
 * removed: if ALL methods fail, return `{ kind: "none" }`.
 */
export type TranscriptResult =
  | { kind: "transcript"; text: string }
  | { kind: "none" };

// ---------------------------------------------------------------------------
// Direct YouTube methods (gated on ALLOW_DIRECT_YOUTUBE=1)
// ---------------------------------------------------------------------------

/**
 * Returns true if the direct YouTube path is enabled.
 * Set ALLOW_DIRECT_YOUTUBE=1 in GitHub Actions or other environments that
 * allow direct youtube.com requests.
 */
export function isDirectYouTubeEnabled(): boolean {
  return process.env["ALLOW_DIRECT_YOUTUBE"] === "1";
}

/**
 * Returns true if a yt-dlp binary is available on PATH.
 * Used to decide whether to attempt yt-dlp transcript extraction.
 */
export function isYtDlpAvailable(): boolean {
  try {
    execFileSync("yt-dlp", ["--version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// yt-dlp rate-limit gate (process-level)
// ---------------------------------------------------------------------------
//
// yt-dlp runs as a subprocess, so it bypasses the HTTP `PerHostLimiter`. To keep
// a bulk 200+-source run polite, every `fetchYtDlpTranscript` call awaits this
// gate, which enforces TWO things across the whole process:
//   1. concurrency 1 — only one yt-dlp subprocess at a time (serialized), and
//   2. a minimum gap between consecutive yt-dlp *invocations* (env
//      `YT_DLP_MIN_GAP_MS`, default 4000ms).
// The gate is injectable (clock + sleep) so tests are deterministic with no real
// timers. A single shared module-level instance serializes all real calls.

/** Read the min-gap (ms) between yt-dlp invocations from env, with a default. */
export function ytDlpMinGapMs(): number {
  const raw = Number(process.env["YT_DLP_MIN_GAP_MS"]);
  return Number.isFinite(raw) && raw >= 0 ? raw : 4000;
}

/** Injectable clock + sleep so the gate's timing is deterministic in tests. */
export interface GateClock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const realClock: GateClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * A serializing async gate that paces yt-dlp invocations. Concurrency is fixed
 * at 1: each `run` waits for the previous one to finish, then sleeps until at
 * least `minGapMs()` has elapsed since the previous invocation *started*, then
 * runs. `minGapMs` is read per-call so env changes (and tests) take effect.
 */
export class YtDlpGate {
  private tail: Promise<unknown> = Promise.resolve();
  private lastStart = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly minGapMs: () => number,
    private readonly clock: GateClock = realClock,
  ) {}

  /** Serialize + pace `fn`. Resolves/rejects with `fn`'s result. */
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(async () => {
      const gap = this.minGapMs();
      const wait = this.lastStart + gap - this.clock.now();
      if (wait > 0) await this.clock.sleep(wait);
      this.lastStart = this.clock.now();
      return fn();
    });
    // Keep the chain alive even when `fn` rejects, so one failure doesn't wedge
    // the gate for every later caller.
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

/** Shared process-wide gate used by all real `fetchYtDlpTranscript` calls. */
const sharedYtDlpGate = new YtDlpGate(ytDlpMinGapMs);

/** The async subprocess runner the transcript fetcher uses (injectable in tests). */
export type ExecRunner = (
  file: string,
  args: readonly string[],
  opts: { timeout: number },
) => Promise<void>;

/**
 * Default runner: spawn yt-dlp via async `execFile`. Resolves on a clean exit
 * and on a non-zero exit alike — yt-dlp may exit non-zero (e.g. when only one of
 * the two requested sub formats exists) yet still have written the .vtt we want.
 * The caller decides success by whether a transcript file appeared.
 */
const defaultExecRunner: ExecRunner = (file, args, opts) =>
  new Promise((resolve) => {
    execFile(file, [...args], { timeout: opts.timeout }, () => resolve());
  });

/** Injectable dependencies for `fetchYtDlpTranscript` (all default to real impls). */
export interface YtDlpDeps {
  exec?: ExecRunner;
  gate?: YtDlpGate;
}

/**
 * Build the lean yt-dlp arg list for fetching ONE English transcript with the
 * fewest requests. Exported for tests.
 *
 * - Restricts subtitles to English only via an explicit `--sub-langs "en,en-orig"`
 *   list — NOT a broad `en.*` glob — so yt-dlp does not pull translated variants
 *   (`en-de-DE`, etc.) that triggered the 429.
 * - Pulls both manual (`--write-subs`) and auto (`--write-auto-subs`) captions.
 * - Adds yt-dlp's own pacing: `--sleep-requests`, `--sleep-subtitles`, plus a few
 *   `--retries` / `--extractor-retries`.
 * - Optionally impersonates a browser (`--impersonate chrome`) when
 *   `YT_DLP_IMPERSONATE` is truthy and curl_cffi is installed.
 */
export function buildYtDlpArgs(videoId: string, tmpBase: string): string[] {
  const sleepReq = ytDlpSleepRequests();
  const sleepSubs = ytDlpSleepSubtitles();
  const args = [
    "--write-subs",
    "--write-auto-subs",
    // Explicit English-only list — never a broad glob (that pulled translated
    // variants and caused the 429).
    "--sub-langs",
    "en,en-orig",
    "--sub-format",
    "vtt",
    "--skip-download",
    "--no-warnings",
    "--sleep-requests",
    String(sleepReq),
    "--sleep-subtitles",
    String(sleepSubs),
    "--retries",
    "3",
    "--extractor-retries",
    "2",
  ];
  if (ytDlpImpersonate()) {
    args.push("--impersonate", "chrome");
  }
  args.push("-o", tmpBase, "--", videoId);
  return args;
}

/** Per-request sleep (seconds) yt-dlp waits between HTTP requests. Env-configurable. */
function ytDlpSleepRequests(): number {
  const raw = Number(process.env["YT_DLP_SLEEP_REQUESTS"]);
  return Number.isFinite(raw) && raw >= 0 ? raw : 1;
}

/** Sleep (seconds) yt-dlp waits between subtitle downloads. Env-configurable. */
function ytDlpSleepSubtitles(): number {
  const raw = Number(process.env["YT_DLP_SLEEP_SUBTITLES"]);
  return Number.isFinite(raw) && raw >= 0 ? raw : 1;
}

/** Whether to pass `--impersonate chrome` (needs curl_cffi). Off unless opted in. */
function ytDlpImpersonate(): boolean {
  const v = process.env["YT_DLP_IMPERSONATE"];
  return v === "1" || v === "true" || v === "chrome";
}

/**
 * Fetch transcript via the direct watch-page method (no proxy).
 * ONLY call when ALLOW_DIRECT_YOUTUBE=1.
 * Returns "" on any failure.
 */
export async function fetchDirectYouTubeTranscript(
  videoId: string,
  fetchFn: FetchFn,
): Promise<string> {
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await fetchFn(watchUrl, {
      headers: {
        Cookie: "CONSENT=YES+cb; SOCS=CAISNQ",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) return "";

    const html = await res.text();
    const playerResponse = extractPlayerResponse(html);
    if (!playerResponse) return "";

    const tracks =
      playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    const track = pickCaptionTrack(tracks);
    if (!track) return "";

    // Try json3 format first
    const json3Res = await fetchFn(`${track.baseUrl}&fmt=json3&hl=en&gl=US`);
    if (json3Res.ok) {
      const json3Text = await json3Res.text();
      const json3Result = parseTranscriptJson3(json3Text);
      if (json3Result) return json3Result;
    }

    // Try srv3 format
    const srv3Res = await fetchFn(`${track.baseUrl}&fmt=srv3&hl=en&gl=US`);
    if (srv3Res.ok) {
      const srv3Text = await srv3Res.text();
      const srv3Result = parseTranscriptJson3(srv3Text);
      if (srv3Result) return srv3Result;
    }

    // Fall back to raw XML
    const xmlRes = await fetchFn(`${track.baseUrl}&hl=en&gl=US`);
    if (xmlRes.ok) {
      const xmlText = await xmlRes.text();
      return parseTranscriptXml(xmlText);
    }

    return "";
  } catch {
    return "";
  }
}

/**
 * Fetch transcript via yt-dlp subprocess — lean, English-only, rate-limited.
 * ONLY call when ALLOW_DIRECT_YOUTUBE=1 AND isYtDlpAvailable().
 *
 * Every call passes through a process-level gate (concurrency 1 + min-gap between
 * invocations, env `YT_DLP_MIN_GAP_MS`) so a bulk run paces yt-dlp politely. The
 * subprocess itself also sleeps between requests/subtitles (`--sleep-requests`,
 * `--sleep-subtitles`). One transcript is fetched with the fewest requests:
 * English-only manual+auto subs, no translated variants. The 60s timeout, the
 * temp-file read of `.en.vtt` / `.en-orig.vtt`, `sanitizePodcastTranscript`, and
 * temp-file cleanup are preserved. Returns "" on any failure; never throws.
 *
 * `deps` is injectable for tests (the exec runner and the gate); production uses
 * the real async `execFile` and the shared module-level gate.
 */
export async function fetchYtDlpTranscript(
  videoId: string,
  deps: YtDlpDeps = {},
): Promise<string> {
  const exec = deps.exec ?? defaultExecRunner;
  const gate = deps.gate ?? sharedYtDlpGate;
  return gate.run(async () => {
    const tmpBase = path.join(os.tmpdir(), `khzytdlp-${videoId}`);
    try {
      await exec("yt-dlp", buildYtDlpArgs(videoId, tmpBase), { timeout: 60000 });

      // Check primary VTT path, then the auto-generated fallback.
      const candidates = [`${tmpBase}.en.vtt`, `${tmpBase}.en-orig.vtt`];

      let content = "";
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          content = fs.readFileSync(candidate, "utf8");
          break;
        }
      }

      return content ? sanitizePodcastTranscript(content, "text/vtt") : "";
    } catch {
      return "";
    } finally {
      // Clean up all temp files matching the base pattern.
      try {
        const dir = path.dirname(tmpBase);
        const base = path.basename(tmpBase);
        const files = fs.readdirSync(dir).filter((f) => f.startsWith(base));
        for (const f of files) {
          try {
            fs.unlinkSync(path.join(dir, f));
          } catch {
            /* ignore individual cleanup failures */
          }
        }
      } catch {
        /* ignore cleanup scan failures */
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/**
 * Fetch a YouTube transcript via proxy (Invidious → Piped), with optional
 * direct fallback methods gated on ALLOW_DIRECT_YOUTUBE=1.
 *
 * Layer order:
 *   - Proxy (Invidious → Piped) — always attempted first when direct is OFF.
 *   When ALLOW_DIRECT_YOUTUBE=1 (e.g. GitHub Actions):
 *     1. yt-dlp subprocess FIRST — it's the path that actually works from a clean
 *        IP; rate-limited via the process gate (see `fetchYtDlpTranscript`).
 *     2. Direct watch-page — second.
 *     3. Proxy (Invidious → Piped) — last, best-effort (the public proxies are
 *        currently dead, but kept as a final fallback).
 *
 * Returns a `TranscriptResult`. Never throws.
 *
 * `deps` is injectable for tests: `ytDlpAvailable` (avoid probing/spawning the
 * real binary) and `ytDlp` (the underlying `fetchYtDlpTranscript` so it can be
 * stubbed). Production passes neither and uses the real implementations.
 */
export interface TranscriptResolverDeps {
  ytDlpAvailable?: () => boolean;
  ytDlp?: (videoId: string) => Promise<string>;
}

export async function fetchYouTubeTranscriptResult(
  videoId: string,
  fetchFn: FetchFn,
  deps: TranscriptResolverDeps = {},
): Promise<TranscriptResult> {
  if (!videoId) return { kind: "none" };

  const ytDlpAvailable = deps.ytDlpAvailable ?? isYtDlpAvailable;
  const ytDlp = deps.ytDlp ?? fetchYtDlpTranscript;

  if (isDirectYouTubeEnabled()) {
    // 1. yt-dlp first — the working path from a non-blocked IP, AND the only
    // tier that never touches undici (it's a subprocess). When yt-dlp is on
    // PATH we rely on it EXCLUSIVELY: a discovery run can hand this function
    // up to ~1000 video ids in one process, and the two tiers below
    // (`fetchDirectYouTubeTranscript`, `fetchProxyTranscript`) each issue
    // several real HTTP fetches per video through Node's built-in undici
    // client. Repeatedly hammering youtube.com/proxy hosts via undici at that
    // volume is what tripped a rare Node/undici parser `AssertionError`
    // thrown asynchronously off a socket event — uncatchable by any
    // try/catch here — and crashed the entire ~720-source ingest run. So a
    // failed/blocked yt-dlp now just yields "no transcript" for that one
    // video instead of falling through to more undici load.
    if (ytDlpAvailable()) {
      const ytdlp = await ytDlp(videoId);
      return ytdlp ? { kind: "transcript", text: ytdlp } : { kind: "none" };
    }

    // yt-dlp unavailable (e.g. local dev without the binary) — these are true
    // fallbacks, not the common CI path, so the fetch cost is acceptable.
    // 2. Direct watch-page next.
    const direct = await fetchDirectYouTubeTranscript(videoId, fetchFn);
    if (direct) return { kind: "transcript", text: direct };

    // 3. Proxies last, best-effort (currently dead).
    const proxyResult = await fetchProxyTranscript(videoId, fetchFn);
    if (proxyResult.kind === "transcript") return proxyResult;

    return { kind: "none" };
  }

  // Direct OFF (default/local): proxy only — never hit youtube.com directly.
  const proxyResult = await fetchProxyTranscript(videoId, fetchFn);
  if (proxyResult.kind === "transcript") return proxyResult;

  return { kind: "none" };
}

/**
 * Legacy shim — returns plain transcript text or "" for the enrichContent layer.
 * Callers that need to distinguish real-transcript vs none should
 * use `fetchYouTubeTranscriptResult` directly.
 *
 * @deprecated Use fetchYouTubeTranscriptResult + enrichContent integration below.
 */
export async function fetchYouTubeTranscript(videoId: string, fetchFn: FetchFn): Promise<string> {
  const result = await fetchYouTubeTranscriptResult(videoId, fetchFn);
  return result.kind === "transcript" ? result.text : "";
}

// ---------------------------------------------------------------------------
// Metadata (engagement + channel signals) — data getting alongside transcripts.
// ---------------------------------------------------------------------------
// The metadata getter lives in `youtube-meta.ts` and is re-exported here so the
// ingest barrel (`export * from "./youtube.js"`) surfaces it automatically. It
// reuses THIS file's `YtDlpGate` (concurrency 1 + min-gap) for pacing.
export {
  fetchYouTubeVideoMeta,
  parseYtDlpJson,
  makeVideoMetaCache,
  YouTubeVideoMetaSchema,
  CachedVideoMetaSchema,
  type YouTubeVideoMeta,
  type FetchMetaDeps,
  type VideoMetaCache,
  type MetaExecRunner,
} from "./youtube-meta.js";

/**
 * The shared process-wide yt-dlp gate, exposed so the metadata getter and any
 * caller can pace ALL yt-dlp invocations (transcripts AND `-J` metadata) through
 * ONE serial gate — the shared-Actions-IP ban is the risk, so everything queues.
 */
export function sharedYtDlpGateInstance(): YtDlpGate {
  return sharedYtDlpGate;
}

// The pure enrichment glue (meta → item metrics + credibility trustScore) lives
// in `youtube-enrich.ts` and is re-exported here so the ingest barrel surfaces it.
export {
  enrichYouTubeItem,
  type YouTubeEnrichable,
  type EnrichYouTubeOpts,
} from "./youtube-enrich.js";
