// apps/site/src/components/mdx/Definition.tsx
//
// A glossary tooltip that TEACHES a term (distinct from Annotation, which CITES
// a source). Same popover/toggle mechanism as Annotation, but a DOTTED AMBER
// underline instead of Annotation's solid edge — the visual grammar of "learn
// this" vs "cite this".
//
// SSR / no-JS: the term is wrapped in a native <abbr title={def}> so the
// definition is exposed on hover AND to assistive tech with zero JavaScript;
// the popover text also lives in the DOM (role="note", aria-describedby) so the
// static render is never blank. Reduced-motion: the popover transition is
// dropped in CSS; on narrow screens the note drops into normal flow (never
// widens the page — same pattern as Annotation).
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { toggleOpen, handleKeyDown, isOutsideClick } from "./lib/annotation-toggle.js";
import "./mdx.css";
import "./Definition.css";

export interface DefinitionProps {
  /** The term being defined (the inline, underlined text). */
  term: string;
  /** The definition surfaced on hover / tap / focus. Plain string. */
  def: string;
  /** Optional richer children rendered in the popover instead of `def`. */
  children?: ReactNode;
}

/**
 * Inline defined term with an accessible teaching popover.
 * Interaction mirrors Annotation: hover opens / leave closes; click toggles;
 * Escape closes; focus opens; outside-tap closes.
 */
export default function Definition({ term, def, children }: DefinitionProps) {
  const defId = useId();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (isOutsideClick(e.target, wrapperRef.current)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => document.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, [open]);

  return (
    <span className="mdx-def" ref={wrapperRef}>
      <button
        type="button"
        className="mdx-def__term"
        aria-describedby={defId}
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
        {/* <abbr title> is the no-JS teaching affordance: native hover tooltip
            + AT exposure with zero script. */}
        <abbr className="mdx-def__abbr" title={def}>
          {term}
        </abbr>
      </button>
      <span
        id={defId}
        role="note"
        className={open ? "mdx-def__note mdx-def__note--open" : "mdx-def__note"}
      >
        {children ?? def}
      </span>
    </span>
  );
}
