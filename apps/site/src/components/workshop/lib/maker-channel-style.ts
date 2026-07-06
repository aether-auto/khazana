// Centralized per-maker-channel visual identity for the Workshop board. This is
// the ONE place a maker channel's color + mono ticker code is defined — the
// board's pinboard "pin", the BuildCard spine, and the filter chip accents all
// read from here, mirroring reads/lib/format-style.ts. So "what does an iot
// build look like" never means hunting through component CSS.
//
// Colors are built EXCLUSIVELY from existing design tokens (var()/color-mix()
// over the warm-dark ladder in styles/tokens.css) — never a raw hex. `diy` and
// `3d-printing` sit in the "good" (green — hands-on/DIY) family; `iot` and
// `embedded` blend toward `info` (cool slate — connected hardware); `ai-projects`
// blends the site's amber signal with clay attention (a build that's also a
// research/AI signal). No two channels read identically at a glance even with
// only 4 semantic anchors (amber/clay/slate/green) to draw from.
import { WORKSHOP_BROWSE_CHANNELS, type FeedItem } from "@khazana/core";

type MakerChannel = (typeof WORKSHOP_BROWSE_CHANNELS)[number];

export interface MakerChannelStyle {
  /** A CSS color value: var(--token) or color-mix(in oklab, ...) over tokens. */
  color: string;
  /** 3-letter uppercase mono "ticker" code — decorative, always aria-hidden. */
  code: string;
}

const STYLE: Record<MakerChannel, MakerChannelStyle> = {
  diy: { color: "var(--good)", code: "DIY" },
  "3d-printing": { color: "color-mix(in oklab, var(--good) 55%, var(--info) 45%)", code: "3DP" },
  iot: { color: "color-mix(in oklab, var(--info) 70%, var(--good) 30%)", code: "IOT" },
  embedded: { color: "color-mix(in oklab, var(--info) 60%, var(--accent) 40%)", code: "EMB" },
  "ai-projects": { color: "color-mix(in oklab, var(--accent) 55%, var(--editorial) 45%)", code: "AIP" },
};

/** Neutral, non-crashing fallback for any channel outside the canonical vocab. */
const FALLBACK: MakerChannelStyle = { color: "var(--ink-faint)", code: "———" };

export function makerChannelStyle(channel: string): MakerChannelStyle {
  return STYLE[channel as MakerChannel] ?? FALLBACK;
}

/** The whole map, in canonical WORKSHOP_BROWSE_CHANNELS order — for tests/tooling. */
export const MAKER_CHANNEL_STYLE_ENTRIES: readonly (readonly [MakerChannel, MakerChannelStyle])[] =
  WORKSHOP_BROWSE_CHANNELS.map((name) => [name, STYLE[name]] as const);

/**
 * The item's primary maker channel — the first of its topics that is a
 * canonical Workshop browse channel, else the first topic, else a generic
 * "build" fallback. Shared by BuildCard (identity + accent) and the sort/
 * filter surfaces so "what is this build's channel" is defined exactly once.
 */
export function primaryMakerChannel(item: Pick<FeedItem, "topics">): string {
  const known = new Set<string>(WORKSHOP_BROWSE_CHANNELS);
  return item.topics.find((t) => known.has(t)) ?? item.topics[0] ?? "build";
}
