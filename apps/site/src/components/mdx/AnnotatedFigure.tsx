// apps/site/src/components/mdx/AnnotatedFigure.tsx
//
// A figure with numbered annotation pins layered over an image (chronicle's
// "here is what to look at"). React island (client:visible). Because it is an
// island it receives an ALREADY-OPTIMIZED image `src` string + width/height
// (produced at the page level via astro:assets getImage()) — it does NOT import
// assets itself. The image is fluid (`width:100%`, height from the width/height
// aspect ratio) so there is no horizontal overflow at 360px; pins are positioned
// purely by percentage.
//
// Interaction: numbered amber pins reveal their `note` on hover / focus / tap
// (the Annotation popover mechanism), and are keyboard-cyclable with the arrow
// keys / Home / End / Escape. It reuses Figure's hairline frame + credit line +
// CSS lightbox aesthetic (mirrored, not imported — its own CSS).
//
// Fallbacks (never blank):
//   • SSR / no-JS → the image is fully visible and every pin's note is listed in
//     an ordered caption list below (rendered server-side, no client needed).
//   • prefers-reduced-motion → pins render static (no pulse/scale), and because a
//     hover popover is motion-y, the notes list is ALWAYS shown below so the
//     content is reachable without relying on reveal transitions.
import { useEffect, useId, useRef, useState } from "react";
import { placePins, cyclePin, type Pin } from "./lib/annotated-figure.js";
import { isOutsideClick } from "./lib/annotation-toggle.js";
import "./mdx.css";
import "./AnnotatedFigure.css";

export interface AnnotatedFigureProps {
  /** Optimized URL string (from getImage()) — NOT an import. */
  src: string;
  /** Intrinsic pixel width — reserves aspect ratio (prevents CLS). */
  width: number;
  /** Intrinsic pixel height. */
  height: number;
  /** Required alt text for a11y. */
  alt: string;
  /** Editorial caption (Fraunces, shared .mdx-caption). */
  caption?: string;
  /** Visible attribution, e.g. "NASA / SDO". */
  credit?: string;
  /** Grounding: the ledger / provenance URL for the image. */
  sourceUrl?: string;
  /** Numbered pins; x,y are fractions in 0..1 of the image box. */
  pins: Pin[];
}

export default function AnnotatedFigure({
  src,
  width,
  height,
  alt,
  caption,
  credit,
  sourceUrl,
  pins,
}: AnnotatedFigureProps) {
  const baseId = useId();
  const placed = placePins(pins ?? []);
  const [active, setActive] = useState<number>(-1);
  // Flipped true after mount: proves JS is running, so the pins carry the notes
  // and the always-rendered fallback list can be hidden (CSS keys off this class).
  // Under no-JS this stays false → the list shows (never blank / unreachable).
  const [hydrated, setHydrated] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setHydrated(true), []);

  // Outside tap/click closes the active pin (matches Annotation).
  useEffect(() => {
    if (active < 0) return;
    const onPointerDown = (e: PointerEvent) => {
      if (isOutsideClick(e.target, rootRef.current)) setActive(-1);
    };
    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, [active]);

  const aspect = `${width} / ${height}`;

  return (
    <figure
      className={hydrated ? "mdx-figure afig afig--hydrated" : "mdx-figure afig"}
      ref={rootRef}
      data-reveal
    >
      <div
        className="afig__frame"
        style={{ aspectRatio: aspect }}
        onKeyDown={(e) => {
          const next = cyclePin(e.key, active, placed.length);
          if (next !== null) {
            e.preventDefault();
            setActive(next);
          }
        }}
      >
        <img
          className="afig__img"
          src={src}
          width={width}
          height={height}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
        />

        {placed.map((p, i) => {
          const open = active === i;
          const noteId = `${baseId}-note-${i}`;
          return (
            <span
              key={i}
              className={`afig__pin afig__pin--${p.side}`}
              style={{ left: `${p.cx * 100}%`, top: `${p.cy * 100}%` }}
            >
              <button
                type="button"
                className={open ? "afig__marker afig__marker--on" : "afig__marker"}
                aria-describedby={noteId}
                aria-expanded={open}
                aria-label={`Annotation ${p.n}: ${p.label}`}
                onClick={() => setActive((cur) => (cur === i ? -1 : i))}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive((cur) => (cur === i ? -1 : cur))}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((cur) => (cur === i ? -1 : cur))}
              >
                {p.n}
              </button>
              <span
                id={noteId}
                role="note"
                className={open ? "afig__note afig__note--open" : "afig__note"}
              >
                <span className="afig__note-label">{p.label}</span>
                {p.note}
              </span>
            </span>
          );
        })}
      </div>

      {/* Credit line — mirrors Figure's mono --ink-label attribution. */}
      {(credit || sourceUrl) && (
        <div className="afig__credit">
          {credit}
          {sourceUrl && (
            <>
              {credit ? " · " : ""}
              <a className="afig__src" href={sourceUrl} rel="noopener noreferrer">
                source
              </a>
            </>
          )}
        </div>
      )}

      {caption ? <figcaption className="mdx-caption afig__cap">{caption}</figcaption> : null}

      {/* SSR / no-JS + reduced-motion reachable: every pin's note as an <ol>.
          Kept in normal flow (not display:none) so it is ALWAYS in the document;
          reduced-motion users read it here rather than via hover reveals. */}
      <ol className="afig__list" aria-label="Annotations">
        {placed.map((p, i) => (
          <li key={i} className="afig__list-item">
            <span className="afig__list-n" aria-hidden="true">
              {p.n}
            </span>
            <span className="afig__list-body">
              <span className="afig__list-label">{p.label}</span> {p.note}
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
