// apps/site/src/components/mdx/CompareSlider.tsx
//
// Before / after image wipe. React island (client:visible). Like AnnotatedFigure
// it receives ALREADY-OPTIMIZED image `src` strings + shared width/height
// (produced at the page level via astro:assets getImage()) — it does NOT import
// assets itself. Both images are the same aligned box; the "after" image is
// clipped by a CSS clip-path whose amount is the split %, so the two align
// pixel-for-pixel and the wipe is pure compositing (no layout, no dep).
//
// The two images are fluid (`width:100%`, aspect reserved from width/height) so
// there is no horizontal overflow at 360px. The wipe is the ONLY motion; the
// surrounding prose stays calm.
//
// Interaction:
//   • Drag the amber handle (pointer) to wipe between the two images.
//   • The handle is a real <input type=range> (ARIA slider "for free", keyboard
//     arrows / Home / End / PageUp-Down move the split) — reduced-motion & no-JS
//     both benefit from the native control.
//
// Fallbacks (never blank):
//   • SSR / no-JS → both images render stacked, each with its label, so the
//     comparison is fully readable without any script. Once hydrated the
//     component switches to the overlay wipe (the stacked pair is hidden).
//   • prefers-reduced-motion → the split is fixed at 50% (no wipe transition);
//     both labels stay visible so the content is reachable without motion.
import { useEffect, useId, useRef, useState } from "react";
import {
  clampSplit,
  splitFromPointer,
  afterClip,
  type Orientation,
} from "./lib/compare-slider.js";
import "./mdx.css";
import "./CompareSlider.css";

export interface CompareSliderProps {
  /** Optimized URL string for the BEFORE image (from getImage()). */
  before: string;
  /** Optimized URL string for the AFTER image (from getImage()). */
  after: string;
  /** Intrinsic pixel width — reserves aspect ratio (prevents CLS). */
  width: number;
  /** Intrinsic pixel height. */
  height: number;
  /** Required alt text describing the comparison, for a11y. */
  alt: string;
  /** Label for the before image (e.g. "1906"). */
  beforeLabel?: string;
  /** Label for the after image (e.g. "Today"). */
  afterLabel?: string;
  /** Editorial caption (Fraunces, shared .mdx-caption). */
  caption?: string;
  /** Wipe direction: "h" horizontal split (default) or "v" vertical. */
  orientation?: Orientation;
}

export default function CompareSlider({
  before,
  after,
  width,
  height,
  alt,
  beforeLabel = "before",
  afterLabel = "after",
  caption,
  orientation = "h",
}: CompareSliderProps) {
  const baseId = useId();
  const [split, setSplit] = useState(50);
  // Flipped true after mount: proves JS runs, so we swap the stacked no-JS pair
  // for the overlay wipe. Under no-JS this stays false → stacked pair shows.
  const [hydrated, setHydrated] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => setHydrated(true), []);

  const aspect = `${width} / ${height}`;
  const isV = orientation === "v";

  function updateFromPointer(clientX: number, clientY: number) {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const next = isV
      ? splitFromPointer(clientY - rect.top, rect.height)
      : splitFromPointer(clientX - rect.left, rect.width);
    setSplit(next);
  }

  return (
    <figure
      className={
        hydrated
          ? `mdx-figure cmp cmp--${orientation} cmp--hydrated`
          : `mdx-figure cmp cmp--${orientation}`
      }
      data-reveal
    >
      <div
        className="cmp__frame"
        ref={frameRef}
        style={{ aspectRatio: aspect }}
        onPointerMove={(e) => {
          if (draggingRef.current) updateFromPointer(e.clientX, e.clientY);
        }}
      >
        {/* BEFORE — the base layer, always fully painted (never a gap). */}
        <img
          className="cmp__img cmp__img--before"
          src={before}
          width={width}
          height={height}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
        {/* AFTER — clipped to `split`. aria-hidden: `alt` on the base covers it. */}
        <img
          className="cmp__img cmp__img--after"
          src={after}
          width={width}
          height={height}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          draggable={false}
          style={{ clipPath: afterClip(split, orientation) }}
        />

        {/* labels — both always visible (reduced-motion friendly). */}
        <span className="cmp__label cmp__label--before" aria-hidden="true">
          {beforeLabel}
        </span>
        <span className="cmp__label cmp__label--after" aria-hidden="true">
          {afterLabel}
        </span>

        {/* the amber handle line + its native range control */}
        <div
          className="cmp__handle"
          style={
            isV
              ? { top: `${split}%` }
              : { left: `${split}%` }
          }
          aria-hidden="true"
        >
          <span className="cmp__grip" />
        </div>
        <input
          type="range"
          className="cmp__range"
          min={0}
          max={100}
          step={1}
          value={split}
          aria-label={`Wipe between ${beforeLabel} and ${afterLabel}: ${alt}`}
          aria-valuetext={`${Math.round(split)}% ${afterLabel}`}
          onChange={(e) => setSplit(clampSplit(Number(e.target.value)))}
          onPointerDown={() => {
            draggingRef.current = true;
          }}
          onPointerUp={() => {
            draggingRef.current = false;
          }}
          onPointerMove={(e) => {
            if (draggingRef.current) updateFromPointer(e.clientX, e.clientY);
          }}
        />
      </div>

      {/* SSR / no-JS: both images stacked with their labels — a complete,
          readable comparison with zero script. Hidden once hydrated. */}
      <div className="cmp__stack" aria-hidden={hydrated}>
        <figure className="cmp__stack-item">
          <img
            src={before}
            width={width}
            height={height}
            alt={`${beforeLabel}: ${alt}`}
            loading="lazy"
            decoding="async"
          />
          <figcaption className="cmp__stack-label">{beforeLabel}</figcaption>
        </figure>
        <figure className="cmp__stack-item">
          <img
            src={after}
            width={width}
            height={height}
            alt={`${afterLabel}: ${alt}`}
            loading="lazy"
            decoding="async"
          />
          <figcaption className="cmp__stack-label">{afterLabel}</figcaption>
        </figure>
      </div>

      {caption ? (
        <figcaption className="mdx-caption cmp__cap" id={`${baseId}-cap`}>
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
