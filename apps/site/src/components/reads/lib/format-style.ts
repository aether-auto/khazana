// Centralized per-format visual identity for the /reads surface. This is the
// ONE place a format's color + ticker code is defined — the gallery card's
// spine + kicker code and the featured hero's atmosphere both read from here,
// so "what does teardown look like" never means hunting through component CSS.
//
// Colors are built EXCLUSIVELY from existing design tokens (var()/color-mix()
// over the warm-dark ladder in styles/tokens.css) — never a raw hex. Grouped
// by each format's `intent` (packages/core/src/format.ts) so related formats
// (chronicle/theater both "narrate"; dispatch/teardown/primer all "explain")
// share a family of hue but are distinguished by a color-mix blend + a unique
// 3-letter mono code, so no two formats read identically at a glance even
// with only 4 semantic anchors (amber/clay/slate/green) to draw from.
import { FORMAT_NAMES, type FormatName } from "@khazana/core";

export interface FormatStyle {
  /** A CSS color value: var(--token) or color-mix(in oklab, ...) over tokens. */
  color: string;
  /** 3-letter uppercase mono "ticker" code — decorative, always aria-hidden. */
  code: string;
}

const STYLE: Record<FormatName, FormatStyle> = {
  // narrate — clay (human/narrative attention), history & geopolitics shelf.
  chronicle: { color: "var(--editorial)", code: "CHR" },
  theater: { color: "color-mix(in oklab, var(--editorial) 60%, var(--accent) 40%)", code: "THR" },
  // explain — cool slate as the family base, each blended differently.
  dispatch: { color: "var(--info)", code: "DSP" },
  teardown: { color: "color-mix(in oklab, var(--info) 55%, var(--accent) 45%)", code: "TRD" },
  primer: { color: "color-mix(in oklab, var(--info) 70%, var(--good) 30%)", code: "PRI" },
  // synthesize — amber signal: the short, sharp, immediate briefing.
  "field-notes": { color: "var(--accent)", code: "FLD" },
  // build — green: DIY/hands-on/growth.
  "build-log": { color: "var(--good)", code: "BLD" },
};

/** Neutral, non-crashing fallback for any format outside the canonical vocab. */
const FALLBACK: FormatStyle = { color: "var(--ink-faint)", code: "———" };

export function formatStyle(format: string): FormatStyle {
  return STYLE[format as FormatName] ?? FALLBACK;
}

/** The whole map, in canonical FORMAT_NAMES order — for tests/tooling. */
export const FORMAT_STYLE_ENTRIES: readonly (readonly [FormatName, FormatStyle])[] = FORMAT_NAMES.map(
  (name) => [name, STYLE[name]] as const,
);
