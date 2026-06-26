/**
 * YouTube transcript fetching via Invidious and Piped public proxy APIs.
 * Never contacts youtube.com, googlevideo.com, or api/timedtext directly.
 *
 * Rate-limiting policy (public-service etiquette):
 *  - Round-robins across the instance list — never hammers one instance.
 *  - Backs off (COOLDOWN_MS) on 429/503 and skips the instance for that window.
 *  - Inserts INTER_REQUEST_DELAY_MS between every request to avoid bursting.
 *  - Per-request timeout (REQUEST_TIMEOUT_MS) so a slow instance doesn't stall the run.
 */

import type { FetchFn } from "./fetchers/build-source.js";
import { sanitizePodcastTranscript } from "./podcast.js";
import { parseTranscriptXml } from "./youtube.js";
import type { TranscriptResult } from "./youtube.js";

// ---------------------------------------------------------------------------
// Instance lists
// ---------------------------------------------------------------------------

/**
 * Invidious instances to try in order. Overridable via INVIDIOUS_INSTANCES env var
 * (comma-separated list of base URLs).
 * Updated: 2026-06-26. Sources: docs.invidious.io/instances/
 */
export const DEFAULT_INVIDIOUS_INSTANCES: readonly string[] = [
  "https://inv.nadeko.net",
  "https://inv.zzls.xyz",
  "https://invidious.perennialte.ch",
  "https://invidious.darkness.services",
  "https://invidious.privacydev.net",
  "https://invidious.flokinet.to",
  "https://invidious.incogniweb.net",
  "https://vid.priv.au",
  "https://invidious.protokolla.fi",
  "https://iv.melmac.space",
];

/**
 * Piped backend API instances to try in order. Overridable via PIPED_INSTANCES env var.
 * Updated: 2026-06-26.
 */
export const DEFAULT_PIPED_INSTANCES: readonly string[] = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://piped-api.privacy.com.de",
  "https://api.piped.projectsegfau.lt",
  "https://pipedapi.in.projectsegfau.lt",
  "https://pipedapi.drgns.space",
  "https://pipedapi.colinslegacy.com",
  "https://piped-backend.zhangkejian.eu.org",
];

// ---------------------------------------------------------------------------
// Rate-limiting constants — all configurable, all documented
// ---------------------------------------------------------------------------

/**
 * Minimum VTT/transcript body size to consider a real transcript.
 * Guards against empty/stub responses from overloaded instances.
 */
export const MIN_PROXY_CHARS = 200;

/**
 * Courtesy delay (ms) inserted between every fetch request to any proxy instance.
 * Prevents bursting against shared public services.
 * Env override: PROXY_INTER_REQUEST_DELAY_MS
 */
export const DEFAULT_INTER_REQUEST_DELAY_MS = 400;

/**
 * How long (ms) to cool-down an instance after receiving a 429 or 503.
 * During this window the instance is skipped entirely.
 * Env override: PROXY_COOLDOWN_MS
 */
export const DEFAULT_COOLDOWN_MS = 60_000; // 1 minute

/**
 * Per-request timeout (ms). A fetch that takes longer than this is abandoned
 * and the next instance is tried.
 * Env override: PROXY_REQUEST_TIMEOUT_MS
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;

// ---------------------------------------------------------------------------
// Env var parsing
// ---------------------------------------------------------------------------

function parseInstanceList(envVar: string, defaults: readonly string[]): string[] {
  const val = process.env[envVar];
  if (!val?.trim()) return [...defaults];
  return val
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseIntEnv(envVar: string, defaultValue: number): number {
  const val = process.env[envVar];
  if (!val?.trim()) return defaultValue;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) || parsed <= 0 ? defaultValue : parsed;
}

export function getInvidiousInstances(): string[] {
  return parseInstanceList("INVIDIOUS_INSTANCES", DEFAULT_INVIDIOUS_INSTANCES);
}

export function getPipedInstances(): string[] {
  return parseInstanceList("PIPED_INSTANCES", DEFAULT_PIPED_INSTANCES);
}

function getInterRequestDelayMs(): number {
  return parseIntEnv("PROXY_INTER_REQUEST_DELAY_MS", DEFAULT_INTER_REQUEST_DELAY_MS);
}

function getCooldownMs(): number {
  return parseIntEnv("PROXY_COOLDOWN_MS", DEFAULT_COOLDOWN_MS);
}

function getRequestTimeoutMs(): number {
  return parseIntEnv("PROXY_REQUEST_TIMEOUT_MS", DEFAULT_REQUEST_TIMEOUT_MS);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** HTTP status codes that should trigger a cooldown for the instance. */
function isCooldownStatus(status: number): boolean {
  return status === 429 || status === 503;
}

/**
 * Wraps a FetchFn call in a timeout race. If the fetch takes longer than
 * `timeoutMs`, the returned promise rejects with a timeout error, which the
 * caller catches and treats as an instance failure.
 */
async function fetchWithTimeout(
  fetchFn: FetchFn,
  url: string,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; text(): Promise<string>; json(): Promise<unknown> }> {
  const timeoutPromise = sleep(timeoutMs).then(() => {
    throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
  });
  return Promise.race([fetchFn(url), timeoutPromise]);
}

// ---------------------------------------------------------------------------
// InstanceScheduler — round-robin + 429/503 cooldown tracking
// ---------------------------------------------------------------------------

/**
 * Tracks which instance to use next (round-robin) and which instances are
 * in a cooldown window (due to 429/503 responses).
 *
 * One shared scheduler per instance list lives at module scope so state
 * persists across calls within the same process run. Tests may pass
 * `invidiousInstances`/`pipedInstances` opts to `fetchProxyTranscript` — the
 * scheduler is re-created per-call when opts are provided, giving tests a clean slate.
 */
export class InstanceScheduler {
  private nextIndex: number = 0;
  private readonly cooldowns = new Map<string, number>(); // instance → cooled-until (ms epoch)

  constructor(private readonly instances: string[]) {}

  /** Returns the next non-cooled instance, or null if all are currently cooled. */
  next(nowMs: number = Date.now()): string | null {
    const count = this.instances.length;
    // Walk the ring once: start from nextIndex, scan up to count candidates.
    for (let i = 0; i < count; i++) {
      const idx = (this.nextIndex + i) % count;
      const instance = this.instances[idx];
      if (!instance) continue;
      const cooledUntil = this.cooldowns.get(instance) ?? 0;
      if (nowMs >= cooledUntil) {
        // Advance ring for the NEXT call so we don't reuse the same instance twice in a row.
        this.nextIndex = (idx + 1) % count;
        return instance;
      }
    }
    return null; // all instances cooled
  }

  /** Mark an instance as cooled-down for `cooldownMs`. */
  cooldown(instance: string, cooldownMs: number, nowMs: number = Date.now()): void {
    this.cooldowns.set(instance, nowMs + cooldownMs);
  }

  /** Reset cooldowns (useful in tests). */
  reset(): void {
    this.cooldowns.clear();
    this.nextIndex = 0;
  }
}

// Module-level schedulers — shared across transcript fetches within one process run.
// Reset whenever instance lists change (env override) by always comparing.
let _invidiousScheduler: InstanceScheduler | null = null;
let _invidiousSchedulerInstances: string[] | null = null;

let _pipedScheduler: InstanceScheduler | null = null;
let _pipedSchedulerInstances: string[] | null = null;

function getInvidiousScheduler(instances: string[]): InstanceScheduler {
  if (!_invidiousScheduler || _invidiousSchedulerInstances?.join() !== instances.join()) {
    _invidiousScheduler = new InstanceScheduler(instances);
    _invidiousSchedulerInstances = instances;
  }
  return _invidiousScheduler;
}

function getPipedScheduler(instances: string[]): InstanceScheduler {
  if (!_pipedScheduler || _pipedSchedulerInstances?.join() !== instances.join()) {
    _pipedScheduler = new InstanceScheduler(instances);
    _pipedSchedulerInstances = instances;
  }
  return _pipedScheduler;
}

// ---------------------------------------------------------------------------
// Invidious caption types
// ---------------------------------------------------------------------------

interface InvidiousCaption {
  label: string;
  languageCode: string;
  url: string;
}

interface InvidiousCaptionsResponse {
  captions?: InvidiousCaption[];
}

/**
 * Pick the best English caption from an Invidious captions list.
 *
 * Preference order:
 * 1. Manual English (no "(auto-generated)" in label, languageCode starts with "en")
 * 2. Any English-tagged track (languageCode starts with "en")
 * 3. First track
 */
export function pickInvidiousCaption(captions: InvidiousCaption[]): InvidiousCaption | null {
  if (captions.length === 0) return null;

  const enManual = captions.find(
    (c) => c.languageCode.startsWith("en") && !c.label.includes("(auto-generated)"),
  );
  if (enManual) return enManual;

  const en = captions.find((c) => c.languageCode.startsWith("en"));
  if (en) return en;

  return captions[0] ?? null;
}

/**
 * Try to fetch a transcript from one Invidious instance.
 * Returns `{ html, cooldown }` — `html` is empty string on failure;
 * `cooldown` is true when the instance returned 429/503 (caller should cool it down).
 */
async function tryInvidiousInstance(
  instance: string,
  videoId: string,
  fetchFn: FetchFn,
  timeoutMs: number,
): Promise<{ html: string; cooldown: boolean }> {
  const NO = { html: "", cooldown: false };
  try {
    // Step 1: fetch captions list
    const captionsUrl = `${instance}/api/v1/captions/${videoId}`;
    const listRes = await fetchWithTimeout(fetchFn, captionsUrl, timeoutMs);
    if (!listRes.ok) {
      return { html: "", cooldown: isCooldownStatus(listRes.status) };
    }

    const listText = await listRes.text();
    const listJson = JSON.parse(listText) as InvidiousCaptionsResponse;
    const captions = listJson.captions ?? [];
    const track = pickInvidiousCaption(captions);
    if (!track) return NO;

    // Step 2: fetch the VTT content (url is instance-relative path)
    const vttUrl = `${instance}${track.url}`;
    const vttRes = await fetchWithTimeout(fetchFn, vttUrl, timeoutMs);
    if (!vttRes.ok) {
      return { html: "", cooldown: isCooldownStatus(vttRes.status) };
    }

    const vttBody = await vttRes.text();
    if (vttBody.length < MIN_PROXY_CHARS) return NO;

    // Step 3: convert to HTML prose
    const html = sanitizePodcastTranscript(vttBody, "text/vtt");
    return { html: html ?? "", cooldown: false };
  } catch {
    return NO;
  }
}

// ---------------------------------------------------------------------------
// Piped subtitle types
// ---------------------------------------------------------------------------

interface PipedSubtitle {
  url: string;
  code: string;
  autoGenerated: boolean;
}

interface PipedStreamsResponse {
  subtitles?: PipedSubtitle[];
}

/**
 * Pick the best English subtitle from a Piped streams response.
 *
 * Preference order:
 * 1. code starts with "en" AND !autoGenerated
 * 2. code starts with "en" (auto-generated acceptable)
 * 3. First subtitle
 */
export function pickPipedSubtitle(subtitles: PipedSubtitle[]): PipedSubtitle | null {
  if (subtitles.length === 0) return null;

  const enManual = subtitles.find((s) => s.code.startsWith("en") && !s.autoGenerated);
  if (enManual) return enManual;

  const en = subtitles.find((s) => s.code.startsWith("en"));
  if (en) return en;

  return subtitles[0] ?? null;
}

/** Returns true if the URL hits YouTube or Google Video directly. */
export function isDirectYouTubeUrl(url: string): boolean {
  return url.includes("youtube.com") || url.includes("googlevideo.com");
}

/**
 * Try to fetch a transcript from one Piped API instance.
 * Returns `{ html, cooldown }`.
 */
async function tryPipedInstance(
  instance: string,
  videoId: string,
  fetchFn: FetchFn,
  timeoutMs: number,
): Promise<{ html: string; cooldown: boolean }> {
  const NO = { html: "", cooldown: false };
  try {
    // Step 1: fetch streams endpoint
    const streamsUrl = `${instance}/streams/${videoId}`;
    const streamsRes = await fetchWithTimeout(fetchFn, streamsUrl, timeoutMs);
    if (!streamsRes.ok) {
      return { html: "", cooldown: isCooldownStatus(streamsRes.status) };
    }

    const streamsText = await streamsRes.text();
    const streamsJson = JSON.parse(streamsText) as PipedStreamsResponse;
    const subtitles = streamsJson.subtitles ?? [];
    const subtitle = pickPipedSubtitle(subtitles);
    if (!subtitle) return NO;

    // CRITICAL: Skip any URL that points to youtube.com or googlevideo.com
    if (isDirectYouTubeUrl(subtitle.url)) return NO;

    // Step 2: fetch the subtitle content
    const subRes = await fetchWithTimeout(fetchFn, subtitle.url, timeoutMs);
    if (!subRes.ok) {
      return { html: "", cooldown: isCooldownStatus(subRes.status) };
    }

    const subBody = await subRes.text();
    if (subBody.length < MIN_PROXY_CHARS) return NO;

    // Step 3: detect format and convert to HTML prose
    let html: string;
    if (subBody.trimStart().startsWith("WEBVTT")) {
      html = sanitizePodcastTranscript(subBody, "text/vtt");
    } else {
      // Try XML parse (YouTube timedtext XML format)
      const xmlParsed = parseTranscriptXml(subBody);
      if (xmlParsed.length > 0) {
        html = sanitizePodcastTranscript(xmlParsed, "text/plain");
      } else {
        html = sanitizePodcastTranscript(subBody, "text/plain");
      }
    }

    return { html: html ?? "", cooldown: false };
  } catch {
    return NO;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch a YouTube transcript via proxy (Invidious → Piped).
 * Never contacts youtube.com directly.
 *
 * Rate-limiting behaviour (applies globally unless opts override instances):
 *  - Round-robins across instances — never repeats the same instance back-to-back.
 *  - 429/503 responses cool-down the offending instance for COOLDOWN_MS.
 *  - INTER_REQUEST_DELAY_MS courtesy sleep is inserted between every request.
 *  - Per-request timeout (REQUEST_TIMEOUT_MS) abandons slow instances.
 *
 * @param videoId          - The YouTube video ID (11-char alphanumeric)
 * @param fetchFn          - Injectable fetch function for testing
 * @param opts.invidiousInstances - Override instance list (test isolation)
 * @param opts.pipedInstances     - Override instance list (test isolation)
 * @param opts.interRequestDelayMs - Override inter-request delay (test speed)
 * @param opts.cooldownMs          - Override cooldown window (test speed)
 * @param opts.requestTimeoutMs    - Override per-request timeout (test speed)
 */
export async function fetchProxyTranscript(
  videoId: string,
  fetchFn: FetchFn,
  opts?: {
    invidiousInstances?: string[];
    pipedInstances?: string[];
    interRequestDelayMs?: number;
    cooldownMs?: number;
    requestTimeoutMs?: number;
  },
): Promise<TranscriptResult> {
  if (!videoId) return { kind: "none" };

  const invidiousInstances = opts?.invidiousInstances ?? getInvidiousInstances();
  const pipedInstances = opts?.pipedInstances ?? getPipedInstances();
  const interRequestDelayMs = opts?.interRequestDelayMs ?? getInterRequestDelayMs();
  const cooldownMs = opts?.cooldownMs ?? getCooldownMs();
  const timeoutMs = opts?.requestTimeoutMs ?? getRequestTimeoutMs();

  // Use fresh schedulers when opts override instance lists (test isolation).
  // Otherwise share the module-level schedulers so round-robin state persists.
  const invScheduler = opts?.invidiousInstances
    ? new InstanceScheduler(invidiousInstances)
    : getInvidiousScheduler(invidiousInstances);
  const pipedScheduler = opts?.pipedInstances
    ? new InstanceScheduler(pipedInstances)
    : getPipedScheduler(pipedInstances);

  let firstRequest = true;

  // ── Invidious pass ──────────────────────────────────────────────────────
  const invCount = invidiousInstances.length;
  for (let tried = 0; tried < invCount; tried++) {
    const instance = invScheduler.next();
    if (!instance) break; // all cooled

    if (!firstRequest) await sleep(interRequestDelayMs);
    firstRequest = false;

    const { html, cooldown } = await tryInvidiousInstance(instance, videoId, fetchFn, timeoutMs);
    if (cooldown) invScheduler.cooldown(instance, cooldownMs);
    if (html) return { kind: "transcript", text: html };
  }

  // ── Piped pass ──────────────────────────────────────────────────────────
  const pipedCount = pipedInstances.length;
  for (let tried = 0; tried < pipedCount; tried++) {
    const instance = pipedScheduler.next();
    if (!instance) break; // all cooled

    if (!firstRequest) await sleep(interRequestDelayMs);
    firstRequest = false;

    const { html, cooldown } = await tryPipedInstance(instance, videoId, fetchFn, timeoutMs);
    if (cooldown) pipedScheduler.cooldown(instance, cooldownMs);
    if (html) return { kind: "transcript", text: html };
  }

  return { kind: "none" };
}
