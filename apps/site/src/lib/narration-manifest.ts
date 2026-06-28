// Narration manifest loader for the Read page. Mirrors the house data-loading
// pattern (see lib/taste.ts): read a JSON file at build time with a graceful
// fallback, never crash the build. Here the file is the TTS pipeline's per-Read
// manifest at `public/audio/reads/<slug>.manifest.json`, written by
// `packages/ingest/src/tts/render.ts`. We surface only what the ReadPlayer island
// consumes — tracks (with their `src` base-prefixed for the deployed base path)
// and the paragraph marks ({index, startSec}) that drive the synced highlight.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { NarrationTrack, ParagraphMark } from "../components/reads/ReadPlayer.tsx";

/** What the Read page hands the ReadPlayer island. */
export interface Narration {
  tracks: NarrationTrack[];
  paragraphs: ParagraphMark[];
}

/**
 * Absolute path to the rendered-narration directory, `apps/site/public/audio/reads`.
 *
 * Resolved from `process.cwd()`, which Astro runs the SSR build (and `astro
 * preview`) from the app root (`apps/site`). A source-relative climb via
 * `import.meta.url` is NOT usable here: at build time this lib is bundled into
 * `dist/`, so `import.meta.url` points into `dist` and the relative hop to the
 * IN-app `public/` lands at the non-existent `dist/public`. (`lib/data.ts` gets
 * away with `import.meta.url` only because its target, the repo-root `data/`, is
 * OUTSIDE `apps/site` — the same number of climbs reaches it from either location.)
 */
function audioReadsDir(): string {
  return join(process.cwd(), "public", "audio", "reads");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Join a site base (e.g. "/khazana/" or "/") to an absolute manifest src path. */
function withBase(base: string, src: string): string {
  // The manifest stores root-absolute paths ("/audio/reads/x.opus"); join them to
  // the configured base without doubling or dropping the separating slash.
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const s = src.startsWith("/") ? src : `/${src}`;
  return `${b}${s}`;
}

/** Parse one manifest track, base-prefixing its `src`. Returns null when malformed. */
function parseTrack(raw: unknown, base: string): NarrationTrack | null {
  if (!isRecord(raw)) return null;
  const { voice, label, src, durationSec } = raw;
  if (typeof voice !== "string" || typeof label !== "string") return null;
  if (typeof src !== "string" || typeof durationSec !== "number") return null;
  return { voice, label, src: withBase(base, src), durationSec };
}

/** Parse one paragraph mark ({index, startSec}); the manifest's `text` is unused here. */
function parseMark(raw: unknown): ParagraphMark | null {
  if (!isRecord(raw)) return null;
  const { index, startSec } = raw;
  if (typeof index !== "number" || typeof startSec !== "number") return null;
  return { index, startSec };
}

/**
 * Load the narration for a Read slug, or null when there is no (valid) manifest.
 * `base` is the site base path (`import.meta.env.BASE_URL`) used to prefix track
 * `src`s so they resolve under a project-page deployment.
 */
export function loadNarration(slug: string, base: string): Narration | null {
  const path = join(audioReadsDir(), `${slug}.manifest.json`);
  if (!existsSync(path)) return null;
  try {
    const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isRecord(raw)) return null;

    const tracks = (Array.isArray(raw.tracks) ? raw.tracks : [])
      .map((t) => parseTrack(t, base))
      .filter((t): t is NarrationTrack => t !== null);
    const paragraphs = (Array.isArray(raw.paragraphs) ? raw.paragraphs : [])
      .map(parseMark)
      .filter((m): m is ParagraphMark => m !== null);

    // No playable track → no player (a manifest with only marks is useless here).
    if (tracks.length === 0) return null;
    return { tracks, paragraphs };
  } catch {
    return null;
  }
}
