import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRegistry, type Registry, type SourceEntry } from "@khazana/core";

/**
 * Load the source registry for the /sources surface. Prefers the live
 * `sources.json` (the Scout writes here, gitignored), falling back to the
 * committed `sources.seed.json` so the page always renders. Returns the
 * validated Registry; a missing/invalid file yields an empty registry rather
 * than crashing the build.
 */
export function loadRegistry(dataDir: string): Registry {
  const main = join(dataDir, "sources.json");
  const seed = join(dataDir, "sources.seed.json");
  const path = existsSync(main) ? main : existsSync(seed) ? seed : null;
  if (!path) return { version: 1, sources: [] };
  try {
    return parseRegistry(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return { version: 1, sources: [] };
  }
}

/**
 * Load the Scout's candidate queue (`sources.pending.json`) if present. Absent
 * or malformed → empty list (the page shows a friendly placeholder). Accepts
 * either a bare `SourceEntry[]` or a `{ sources: [...] }` registry-shaped file.
 */
export function loadPending(dataDir: string): SourceEntry[] {
  const path = join(dataDir, "sources.pending.json");
  if (!existsSync(path)) return [];
  try {
    const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
    const arr = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object" && Array.isArray((raw as { sources?: unknown }).sources)
        ? (raw as { sources: unknown[] }).sources
        : [];
    return parseRegistry({ version: 1, sources: arr }).sources;
  } catch {
    return [];
  }
}

export interface ChannelGroup {
  channel: string;
  sources: SourceEntry[];
}

/**
 * Group sources by channel for the by-category view. A source appears under
 * every channel it serves; sources with no channels collect under "unsorted".
 * Within a channel, sources are sorted by trustScore (desc) then id, so the
 * most-trusted leads each section. Groups are ordered by `channelOrder` first
 * (the canonical CHANNELS sequence), then any remaining channels alphabetically.
 */
export function groupByChannel(
  sources: SourceEntry[],
  channelOrder: readonly string[] = [],
): ChannelGroup[] {
  const byChannel = new Map<string, SourceEntry[]>();
  for (const s of sources) {
    const channels = s.channels.length > 0 ? s.channels : ["unsorted"];
    for (const c of channels) {
      const list = byChannel.get(c) ?? [];
      list.push(s);
      byChannel.set(c, list);
    }
  }
  const orderIndex = new Map(channelOrder.map((c, i) => [c, i]));
  const channels = [...byChannel.keys()].sort((a, b) => {
    const ia = orderIndex.get(a) ?? Number.POSITIVE_INFINITY;
    const ib = orderIndex.get(b) ?? Number.POSITIVE_INFINITY;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b);
  });
  return channels.map((channel) => ({
    channel,
    sources: byChannel
      .get(channel)!
      .slice()
      .sort((a, b) => (b.trustScore ?? 0) - (a.trustScore ?? 0) || a.id.localeCompare(b.id)),
  }));
}
