// apps/site/src/components/mdx/Annotation.tsx
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import katex from "katex";
import { toggleOpen, handleKeyDown, isOutsideClick } from "./lib/annotation-toggle.js";
import "./mdx.css";
import "./Annotation.css";

export interface AnnotationProps {
  /** The inline term being annotated. */
  term: string;
  /** Margin-note / popover text. Plain string (kept short, reading-voice). */
  note: string;
  /**
   * When true, `term` is a LaTeX math expression typeset with KaTeX instead of
   * shown as a plain string (e.g. `g(f) = p\\ln(1 + bf) + q\\ln(1 - f)`).
   * Defaults to false so prose terms ("information theory") render as text.
   */
  math?: boolean;
  /** Optional richer children rendered inside the note instead of `note`. */
  children?: ReactNode;
}

/**
 * Inline annotated term with an accessible popover note.
 *
 * Interaction model:
 *  - Desktop: hover opens, mouse-leave closes; click/tap toggles (keyboard-toggleable).
 *  - Touch / mobile: tap toggles open/closed; tap outside closes.
 *  - Keyboard: Escape closes. Focus opens (keeps original behaviour for tab-users).
 *  - Math terms: `pointer-events:none` on the inner KaTeX span ensures the button
 *    always receives the activation event (not the inner content node).
 *
 * Accessibility: aria-expanded tracks open state; note linked via aria-describedby
 * so the SSR/no-JS path still exposes it to assistive tech.
 */
export default function Annotation({ term, note, math = false, children }: AnnotationProps) {
  const noteId = useId();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);

  // Typeset the math term once. `throwOnError: false` keeps a malformed term
  // from blowing up the island — KaTeX renders the source in an error color.
  const mathHtml = useMemo(
    () => (math ? katex.renderToString(term, { throwOnError: false, displayMode: false }) : null),
    [math, term],
  );

  // Outside-click / outside-tap → close the note.
  useEffect(() => {
    if (!open) return; // only listen while open
    const onPointerDown = (e: PointerEvent) => {
      if (isOutsideClick(e.target, wrapperRef.current)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => document.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, [open]);

  return (
    <span className="mdx-annot" ref={wrapperRef}>
      <button
        type="button"
        className={math ? "mdx-annot__term mdx-annot__term--math" : "mdx-annot__term"}
        aria-describedby={noteId}
        aria-expanded={open}
        onClick={() => setOpen(toggleOpen)}
        onKeyDown={(e) => {
          const next = handleKeyDown(e.key, open);
          if (next !== null) setOpen(next);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {math && mathHtml ? (
          // pointer-events:none on the inner span ensures touch events bubble
          // up to the <button> rather than being absorbed by the KaTeX content.
          <span
            className="mdx-annot__math"
            aria-label={term}
            style={{ pointerEvents: "none" }}
            dangerouslySetInnerHTML={{ __html: mathHtml }}
          />
        ) : (
          term
        )}
      </button>
      <span
        id={noteId}
        role="note"
        className={open ? "mdx-annot__note mdx-annot__note--open" : "mdx-annot__note"}
      >
        {children ?? note}
      </span>
    </span>
  );
}
