// Constellation coordinate mapping — the pure, deterministic heart of "First
// Light". Turns the ranked feed into a 3D star field where POSITION CARRIES
// MEANING (art-direction §1, §4): this is the product's data, not a decorative
// particle cloud. Removing it would remove khazana's identity.
//
//   channel  → ANGLE   (which band of the sky a signal belongs to)
//   recency  → RADIUS   (fresh signal sits near the bright center; old recedes)
//   rank     → BRIGHTNESS (the brightest stars are the lead feed cards)
//
// Pure + framework-free so the SSR baked fallback, the unit tests, and the live
// OGL field all agree on exactly where every star sits.

import type { FeedItem } from "@khazana/core";
import { CHANNELS } from "@khazana/core";

/** A star in the constellation — normalized, renderer-agnostic coordinates. */
export interface Star {
  /** Stable feed-item id (lets the feed link a card to its star). */
  id: string;
  /** Angle around the field, radians [0, 2π). Derived from channel. */
  angle: number;
  /** Distance from center, [0, 1]. 0 = freshest/center, 1 = oldest/edge. */
  radius: number;
  /** Visual brightness, (0, 1]. 1 = the brightest catch (rank 0 / lead). */
  brightness: number;
  /** Depth for parallax, [-1, 1]. Derived deterministically from id+rank so
   *  the field has real z-spread without random pop between renders. */
  depth: number;
  /** 0-based rank in the curated list (0 = most prominent). */
  rank: number;
  /** Index of the primary channel in CHANNELS (or -1 if none/unknown). */
  channelIndex: number;
}

/** How old (ms) a star can be before it sits at the rim. ~10 days. */
export const MAX_AGE_MS = 10 * 24 * 60 * 60 * 1000;

/** Channels mapped to evenly-spaced angles so each band owns a slice of sky. */
const CHANNEL_COUNT = CHANNELS.length;

/** Primary channel of an item = its first topic that is a known channel. */
export function primaryChannelIndex(item: FeedItem): number {
  for (const t of item.topics) {
    const i = CHANNELS.indexOf(t as (typeof CHANNELS)[number]);
    if (i !== -1) return i;
  }
  return -1;
}

/** Deterministic [0,1) hash from a string — stable jitter without Math.random,
 *  so SSR and client renders place every star identically (no hydration drift). */
export function hash01(s: string): number {
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // mix to a well-distributed float in [0,1)
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Map one item to a star. `nowMs` lets recency be computed deterministically. */
export function toStar(item: FeedItem, rank: number, total: number, nowMs: number): Star {
  const ci = primaryChannelIndex(item);

  // ANGLE: channel owns a slice of the sky; a small id-derived jitter spreads
  // items within a channel so they don't stack on one radial line.
  const slice = (2 * Math.PI) / CHANNEL_COUNT;
  const base = ci === -1 ? hash01(item.id) * 2 * Math.PI : ci * slice;
  const jitter = (hash01(item.id + "θ") - 0.5) * slice * 0.8;
  const angle = normalizeAngle(base + jitter);

  // RADIUS: recency → distance. Fresh = center (where First Light ignites),
  // old = rim. Clamped to a comfortable [0.12, 1] so nothing sits dead-center.
  const ageMs = Math.max(0, nowMs - Date.parse(item.publishedAt));
  const recency = clamp01(ageMs / MAX_AGE_MS);
  const radius = 0.12 + recency * 0.88;

  // BRIGHTNESS: rank → luminosity. Lead (rank 0) is brightest; a gentle curve so
  // the front of the feed reads as a few bright catches over a dim long tail.
  const t = total > 1 ? rank / (total - 1) : 0;
  const brightness = clamp01(1 - t * t * 0.82);

  // DEPTH: deterministic z-spread for parallax; brighter/leading stars pull
  // slightly toward the viewer (closer = more parallax).
  const depth = (hash01(item.id + "z") * 2 - 1) * (0.5 + 0.5 * (1 - t));

  return { id: item.id, angle, radius, brightness, depth, rank, channelIndex: ci };
}

/** Map the whole ranked feed into a constellation. Order preserved = rank. */
export function buildConstellation(
  items: readonly FeedItem[],
  nowMs: number = Date.now(),
): Star[] {
  const total = items.length;
  return items.map((it, rank) => toStar(it, rank, total, nowMs));
}

/** Project a normalized star to centered [-1,1] x/y (for the baked SVG fallback
 *  and any 2D readout). The live OGL field uses angle/radius/depth directly. */
export function projectXY(star: Star): { x: number; y: number } {
  return { x: Math.cos(star.angle) * star.radius, y: Math.sin(star.angle) * star.radius };
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function normalizeAngle(a: number): number {
  const twoPi = 2 * Math.PI;
  return ((a % twoPi) + twoPi) % twoPi;
}
