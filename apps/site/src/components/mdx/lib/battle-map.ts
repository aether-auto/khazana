// apps/site/src/components/mdx/lib/battle-map.ts
//
// Pure, DOM-free logic for <BattleMap> — the image-base tactical/operational
// map that lets a reader RELIVE a battle phase by phase. Everything spatial and
// stateful lives here so the React island is a thin renderer and the tricky bits
// (phase indexing, unit-glyph geometry, coordinate→SVG mapping, arrow-path
// geometry, side→token color) are unit-tested independently of React.
//
// Coordinate model
// ────────────────
// The base map is an ALREADY-OPTIMIZED image (like AnnotatedFigure: the read
// passes src+width+height from getImage()). The SVG overlay shares the image's
// OWN pixel box as its viewBox (`0 0 width height`), so a unit position `at:
// [x, y]` in 0..1 maps to pixels via `toSvg([x, y], width, height)` and the
// overlay registers EXACTLY over the terrain at any rendered size (the SVG and
// the <img> both scale to width:100% with the same aspect ratio → no drift, no
// 360px overflow).

// ── side / tone → token color ────────────────────────────────────────────────

export type SideTone = "friendly" | "enemy" | "neutral";

export interface SideSpec {
  id: string;
  label: string;
  /** friendly → amber (--accent), enemy → clay (--editorial), neutral → faint. */
  tone?: SideTone;
}

export interface ResolvedSide extends SideSpec {
  tone: SideTone;
  /** the CSS custom-property color token this side paints with. */
  color: string;
  /** a dimmer companion token (fills, halos). */
  colorDim: string;
}

/**
 * Map a tone to its design-system color TOKEN (never a hardcoded hex): friendly
 * reads as amber signal, enemy as clay attention, neutral as the faint ink. An
 * unknown/missing tone falls back to neutral so a side is never un-colored.
 */
export function toneColor(tone: SideTone | undefined): { color: string; colorDim: string } {
  switch (tone) {
    case "friendly":
      return { color: "var(--accent)", colorDim: "var(--accent-dim)" };
    case "enemy":
      return { color: "var(--editorial)", colorDim: "var(--editorial-dim)" };
    case "neutral":
    default:
      return { color: "var(--ink-faint)", colorDim: "var(--ink-label)" };
  }
}

/** Normalize the sides list and attach resolved token colors + a lookup map. */
export function resolveSides(sides: SideSpec[] | undefined): {
  list: ResolvedSide[];
  byId: Map<string, ResolvedSide>;
} {
  const list = (Array.isArray(sides) ? sides : []).map((s) => {
    const tone: SideTone = s.tone ?? "neutral";
    const { color, colorDim } = toneColor(tone);
    return { ...s, tone, color, colorDim };
  });
  const byId = new Map(list.map((s) => [s.id, s]));
  return { list, byId };
}

/** Resolve a side id against the map, falling back to a neutral placeholder. */
export function sideById(
  byId: Map<string, ResolvedSide>,
  id: string | undefined,
): ResolvedSide {
  if (id != null) {
    const found = byId.get(id);
    if (found) return found;
  }
  const { color, colorDim } = toneColor("neutral");
  return { id: id ?? "?", label: id ?? "Unknown", tone: "neutral", color, colorDim };
}

// ── phase indexing ───────────────────────────────────────────────────────────

/** Clamp a phase index into [0, count-1]; empty count → 0. */
export function clampPhase(index: number, count: number): number {
  if (count <= 0) return 0;
  if (index < 0) return 0;
  if (index > count - 1) return count - 1;
  return Math.floor(index);
}

export function canGoPrev(index: number): boolean {
  return index > 0;
}
export function canGoNext(index: number, count: number): boolean {
  return index < count - 1;
}

/**
 * Next phase index for a keyboard/scrub key. Right/Down/PageDown → next,
 * Left/Up/PageUp → prev, Home → first, End → last. Returns the new index, or
 * null if the key is unhandled (so the caller can ignore it). Clamped, never
 * wraps (a battle has a definite beginning and end).
 */
export function stepPhase(
  key: string,
  current: number,
  count: number,
): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
    case "PageDown":
      return clampPhase(current + 1, count);
    case "ArrowLeft":
    case "ArrowUp":
    case "PageUp":
      return clampPhase(current - 1, count);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

// ── coordinate → SVG mapping ───────────────────────────────────────────────────

export type Coord = [number, number];

/** Clamp a 0..1 fraction; NaN → 0. */
export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Map a normalized `at:[x,y]` (0..1 over the image) to a pixel point in the
 * overlay's viewBox (which equals the image's own `width × height` box). Values
 * are clamped to the box so a stray coordinate never lands the glyph off-map.
 */
export function toSvg(at: Coord, width: number, height: number): Coord {
  const w = width > 0 ? width : 1000;
  const h = height > 0 ? height : 1000;
  return [round2(clamp01(at?.[0]) * w), round2(clamp01(at?.[1]) * h)];
}

/** Choose a popover side so a marker near the right edge opens its label LEFT. */
export function popoverSide(x01: number): "left" | "right" {
  return clamp01(x01) > 0.6 ? "left" : "right";
}

// ── unit glyphs (NATO-inspired, simple + legible) ─────────────────────────────

export type UnitType =
  | "infantry"
  | "armor"
  | "cavalry"
  | "artillery"
  | "naval"
  | "air"
  | "hq";

export interface UnitSpec {
  id?: string;
  side: string;
  type: UnitType;
  label?: string;
  strength?: string;
  /** [x, y] in 0..1 over the image. */
  at: Coord;
}

/**
 * The inner symbol geometry for a unit type, drawn inside a `size × (size*0.66)`
 * NATO-style box centered at the origin (the marker <g> is translated to the
 * unit's pixel position). Returns primitives the renderer maps to <line> /
 * <ellipse> / <circle> / <path> — colored by the unit's side token in the view.
 *
 * Glyph key (deliberately iconic, not decorative):
 *   infantry  → box with a diagonal X            (crossed rifles)
 *   armor     → box with a horizontal oval        (a tank track loop)
 *   cavalry   → box with a single forward slash    (a sabre stroke)
 *   artillery → box with a filled centre dot       (a shell)
 *   naval     → a ship hull glyph (no box)         (a vessel)
 *   air       → a swept wing chevron (no box)      (an aircraft)
 *   hq        → a small flag on a staff (no box)   (a command post)
 */
export interface GlyphPart {
  kind: "line" | "ellipse" | "circle" | "path" | "polyline";
  /** for line: [x1,y1,x2,y2]; for others see below. */
  a?: number;
  b?: number;
  c?: number;
  d?: number;
  /** ellipse rx/ry, circle r. */
  rx?: number;
  ry?: number;
  r?: number;
  /** path/polyline geometry string. */
  points?: string;
  /** whether this primitive is filled (else stroked). */
  fill?: boolean;
}

export interface Glyph {
  /** true → draw the standard NATO box frame around the symbol. */
  box: boolean;
  /** half-width of the box (box spans -w..w in x). */
  w: number;
  /** half-height of the box (box spans -h..h in y). */
  h: number;
  parts: GlyphPart[];
}

const KNOWN_UNIT_TYPES: ReadonlySet<string> = new Set([
  "infantry",
  "armor",
  "cavalry",
  "artillery",
  "naval",
  "air",
  "hq",
]);

/** Normalize an arbitrary type string to a known UnitType (default infantry). */
export function normalizeUnitType(type: string | undefined): UnitType {
  return (type && KNOWN_UNIT_TYPES.has(type) ? type : "infantry") as UnitType;
}

/**
 * Build the glyph geometry for a unit type at a given box half-size `w`. The box
 * is 3:2 (w : h) — the NATO convention — so `h = w * 2/3`. Pure numbers, so the
 * renderer stays declarative and the shapes are unit-tested.
 */
export function unitGlyph(type: UnitType, w = 13): Glyph {
  const h = round2(w * (2 / 3));
  switch (type) {
    case "infantry":
      // box + diagonal X
      return {
        box: true,
        w,
        h,
        parts: [
          { kind: "line", a: -w, b: -h, c: w, d: h },
          { kind: "line", a: -w, b: h, c: w, d: -h },
        ],
      };
    case "armor":
      // box + horizontal oval (tank track)
      return {
        box: true,
        w,
        h,
        parts: [{ kind: "ellipse", rx: round2(w * 0.62), ry: round2(h * 0.5) }],
      };
    case "cavalry":
      // box + single forward slash
      return {
        box: true,
        w,
        h,
        parts: [{ kind: "line", a: -w, b: h, c: w, d: -h }],
      };
    case "artillery":
      // box + filled centre dot
      return {
        box: true,
        w,
        h,
        parts: [{ kind: "circle", r: round2(h * 0.42), fill: true }],
      };
    case "naval": {
      // a simple ship hull: a shallow boat with a mast tick (no box)
      const hw = round2(w * 1.05);
      return {
        box: false,
        w: hw,
        h,
        parts: [
          {
            kind: "path",
            points: `M ${-hw} ${round2(-h * 0.1)} L ${hw} ${round2(-h * 0.1)} L ${round2(hw * 0.6)} ${h} L ${round2(-hw * 0.6)} ${h} Z`,
          },
          { kind: "line", a: 0, b: round2(-h * 0.1), c: 0, d: round2(-h * 1.5) },
        ],
      };
    }
    case "air": {
      // a swept wing chevron (no box)
      const ww = round2(w * 1.15);
      return {
        box: false,
        w: ww,
        h,
        parts: [
          {
            kind: "polyline",
            points: `${-ww},${h} 0,${round2(-h * 0.9)} ${ww},${h}`,
          },
          { kind: "line", a: 0, b: round2(-h * 0.9), c: 0, d: h },
        ],
      };
    }
    case "hq":
    default: {
      // a small flag on a staff (no box) — the command post
      const fw = round2(w * 1.1);
      return {
        box: false,
        w: fw,
        h,
        parts: [
          // staff
          { kind: "line", a: round2(-fw * 0.7), b: round2(-h * 1.5), c: round2(-fw * 0.7), d: h },
          // flag pennant (filled)
          {
            kind: "path",
            points: `M ${round2(-fw * 0.7)} ${round2(-h * 1.5)} L ${fw} ${round2(-h * 1.5)} L ${round2(fw * 0.35)} ${round2(-h * 0.55)} L ${round2(-fw * 0.7)} ${round2(-h * 0.55)} Z`,
            fill: true,
          },
        ],
      };
    }
  }
}

// ── movement arrows ────────────────────────────────────────────────────────────

export type MovementKind = "advance" | "attack" | "retreat" | "supply";

export interface MovementSpec {
  side: string;
  from: Coord;
  to: Coord;
  kind?: MovementKind;
  label?: string;
}

const KNOWN_MOVEMENT_KINDS: ReadonlySet<string> = new Set([
  "advance",
  "attack",
  "retreat",
  "supply",
]);

export function normalizeMovementKind(kind: string | undefined): MovementKind {
  return (kind && KNOWN_MOVEMENT_KINDS.has(kind) ? kind : "advance") as MovementKind;
}

export interface ArrowGeometry {
  /** the shaft path `d` (a gentle quadratic curve from→to). */
  d: string;
  /** the arrowhead path `d` (a small filled triangle at the `to` end). */
  head: string;
  /** the shaft midpoint (for the hover label anchor), in SVG px. */
  mid: Coord;
  /** approximate shaft length in px (for stroke-dash draw-on math). */
  length: number;
  /** the resolved movement kind. */
  kind: MovementKind;
}

/**
 * Build the geometry for a movement arrow between two normalized points over the
 * image. The shaft is a shallow quadratic curve (bowed perpendicular to the
 * from→to line) so overlapping advances read as distinct sweeps rather than
 * colliding straight lines; the arrowhead is a filled triangle aligned to the
 * incoming direction. All in the overlay's `width × height` viewBox pixels.
 */
export function arrowGeometry(
  from: Coord,
  to: Coord,
  width: number,
  height: number,
  headSize = 12,
  bow = 0.12,
): ArrowGeometry {
  const [x1, y1] = toSvg(from, width, height);
  const [x2, y2] = toSvg(to, width, height);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1;
  // Control point bowed to the left of the direction of travel.
  const nx = -dy / dist; // unit normal
  const ny = dx / dist;
  const cx = round2((x1 + x2) / 2 + nx * dist * bow);
  const cy = round2((y1 + y2) / 2 + ny * dist * bow);
  const d = `M ${round2(x1)} ${round2(y1)} Q ${cx} ${cy} ${round2(x2)} ${round2(y2)}`;

  // Arrowhead: aim it along the tangent at the end (from control point → end).
  const hdx = x2 - cx;
  const hdy = y2 - cy;
  const hlen = Math.hypot(hdx, hdy) || 1;
  const ux = hdx / hlen;
  const uy = hdy / hlen;
  // two base corners, splayed off the tip
  const spread = 0.55;
  const bx = x2 - ux * headSize;
  const by = y2 - uy * headSize;
  const leftX = round2(bx + -uy * headSize * spread);
  const leftY = round2(by + ux * headSize * spread);
  const rightX = round2(bx - -uy * headSize * spread);
  const rightY = round2(by - ux * headSize * spread);
  const head = `M ${round2(x2)} ${round2(y2)} L ${leftX} ${leftY} L ${rightX} ${rightY} Z`;

  // curve length ≈ chord + small bow correction; good enough for dash reveal.
  const length = round2(dist * (1 + bow * 0.9));
  // The visual mid is the point on the quadratic at t=0.5.
  const mid: Coord = [
    round2(0.25 * x1 + 0.5 * cx + 0.25 * x2),
    round2(0.25 * y1 + 0.5 * cy + 0.25 * y2),
  ];

  return { d, head, mid, length, kind: "advance" };
}

/** Stroke-dash pair that reveals a path of `length` when offset→0 (draw-on). */
export function dashParams(length: number): { array: number; offset: number } {
  const array = Math.max(1, round2(length));
  return { array, offset: array };
}

// ── front lines / control areas ───────────────────────────────────────────────

export type FrontKind = "line" | "area";

export interface FrontSpec {
  side?: string;
  kind?: FrontKind;
  points: Coord[];
}

export interface FrontGeometry {
  kind: FrontKind;
  /** SVG path `d`: an open polyline for "line", a closed polygon for "area". */
  d: string;
  /** the resolved side id (for color lookup) — may be undefined (neutral). */
  side?: string;
}

/**
 * Build a front's SVG path from its normalized points. `line` → an open
 * polyline (the front edge); `area` → a closed polygon (a control/occupied
 * zone, rendered translucent). Fewer than 2 points yields an empty `d` (skipped
 * by the renderer) rather than a malformed path.
 */
export function frontGeometry(
  front: FrontSpec,
  width: number,
  height: number,
): FrontGeometry {
  const kind: FrontKind = front?.kind === "area" ? "area" : "line";
  const pts = Array.isArray(front?.points) ? front.points : [];
  if (pts.length < 2) return { kind, d: "", side: front?.side };
  const cmds = pts
    .map((p, i) => {
      const [x, y] = toSvg(p, width, height);
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
  const d = kind === "area" ? `${cmds} Z` : cmds;
  return { kind, d, side: front?.side };
}

// ── phase model (the whole serializable shape, normalized for the renderer) ────

export interface PhaseSpec {
  title: string;
  time?: string;
  /** short HTML string describing this phase. */
  note?: string;
  units?: UnitSpec[];
  movements?: MovementSpec[];
  fronts?: FrontSpec[];
}

/** Safe list accessor: always an array, never throws. */
export function phaseList(phases: PhaseSpec[] | undefined): PhaseSpec[] {
  return Array.isArray(phases) ? phases : [];
}

/** Human summary of a phase's forces (used in the accessible fallback list). */
export function phaseSummary(phase: PhaseSpec | undefined): string {
  const u = phase?.units?.length ?? 0;
  const m = phase?.movements?.length ?? 0;
  const f = phase?.fronts?.length ?? 0;
  const bits: string[] = [];
  if (u) bits.push(`${u} unit${u > 1 ? "s" : ""}`);
  if (m) bits.push(`${m} move${m > 1 ? "s" : ""}`);
  if (f) bits.push(`${f} front${f > 1 ? "s" : ""}`);
  return bits.join(" · ");
}

function round2(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}
