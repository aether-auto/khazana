// Taste dashboard data layer. Mirrors the curate TastePayload shape (see
// packages/curate/src/format-affinity.ts) WITHOUT depending on @khazana/curate
// (a pipeline package, not a site dep). Loads data/taste.json, falling back to
// the committed data/taste.sample.json; never crashes the build.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FORMAT_NAMES, type FormatName } from "@khazana/core";

export interface TastePayload {
  ready: boolean;
  topics: Record<string, number>;
  entities: Record<string, number>;
  formatAffinity: Partial<Record<FormatName, number>>;
}

export interface Bar {
  label: string;
  value: number;
}

const EMPTY: TastePayload = { ready: false, topics: {}, entities: {}, formatAffinity: {} };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function numberMap(v: unknown): Record<string, number> {
  if (!isRecord(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v)) if (typeof val === "number") out[k] = val;
  return out;
}

/** Load taste.json, fall back to taste.sample.json, else a safe not-ready payload. */
export function loadTaste(dir: string): TastePayload {
  const main = join(dir, "taste.json");
  const sample = join(dir, "taste.sample.json");
  const path = existsSync(main) ? main : sample;
  if (!existsSync(path)) return { ...EMPTY };
  try {
    const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isRecord(raw)) return { ...EMPTY };
    return {
      ready: raw.ready === true,
      topics: numberMap(raw.topics),
      entities: numberMap(raw.entities),
      formatAffinity: numberMap(raw.formatAffinity) as Partial<Record<FormatName, number>>,
    };
  } catch {
    return { ...EMPTY };
  }
}

/** Top-n entries of an affinity map as bars, value desc, label asc on ties. */
export function topN(map: Record<string, number>, n: number): Bar[] {
  return Object.entries(map)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => (b.value !== a.value ? b.value - a.value : a.label.localeCompare(b.label)))
    .slice(0, n);
}

/** Format affinities as bars in canonical FORMAT_NAMES order, omitting absent formats. */
export function formatBars(affinity: Partial<Record<FormatName, number>>): Bar[] {
  const out: Bar[] = [];
  for (const name of FORMAT_NAMES) {
    const v = affinity[name];
    if (typeof v === "number") out.push({ label: name, value: v });
  }
  return out;
}
