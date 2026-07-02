// apps/site/src/components/mdx/Math.tsx
//
// A first-class DISPLAY equation + numbered derivation block. KaTeX is already
// vendored (Annotation uses it), so this is nearly free. `throwOnError:false`
// keeps a malformed expression from blowing up the island — KaTeX renders the
// source in an error color instead.
//
// SSR / no-JS: KaTeX renders to HTML at module scope (renderToString is
// synchronous and server-safe), so ALL math — the headline `tex`, every `steps`
// row — is fully typeset in the static render, with no JavaScript. The only
// thing JS adds is the per-step "why" popover reveal (reusing Annotation's
// toggle mechanism); without JS the note still lives in the DOM (role="note",
// linked via aria-describedby) so AT and no-JS readers can reach it.
// Reduced-motion: the popover transition is dropped in CSS; nothing else moves.
import { useEffect, useId, useRef, useState } from "react";
import katex from "katex";
import { toggleOpen, handleKeyDown, isOutsideClick } from "./lib/annotation-toggle.js";
import "./mdx.css";
import "./Math.css";

export interface MathStep {
  /** KaTeX display string for this derivation line. */
  tex: string;
  /** Optional "why" note revealed on hover / tap / focus. */
  note?: string;
}

export interface MathProps {
  /** The headline display equation (KaTeX display string). */
  tex: string;
  /** Optional numbered derivation; each line is independently annotatable. */
  steps?: MathStep[];
  /** Equation number for cross-reference, e.g. "(3)". */
  label?: string;
  /** Caption below the block (shared .mdx-caption). */
  caption?: string;
  /** Auto-number the derivation rows (1., 2., …). Default false. */
  numbered?: boolean;
}

function tex2html(tex: string): string {
  return katex.renderToString(tex, { throwOnError: false, displayMode: true });
}

/** A single derivation row with an optional reveal-on-hover "why" note. */
function StepRow({
  step,
  index,
  numbered,
}: {
  step: MathStep;
  index: number;
  numbered: boolean;
}) {
  const noteId = useId();
  const [open, setOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const html = tex2html(step.tex);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (isOutsideClick(e.target, rowRef.current)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => document.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, [open]);

  const hasNote = Boolean(step.note);

  return (
    <div className="mdx-math__step" ref={rowRef}>
      {numbered && <span className="mdx-math__stepnum" aria-hidden="true">{index + 1}</span>}
      {hasNote ? (
        <button
          type="button"
          className="mdx-math__stepbtn"
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
          <span
            className="mdx-math__tex"
            style={{ pointerEvents: "none" }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
          <span className="mdx-math__whyhint" aria-hidden="true">why</span>
        </button>
      ) : (
        <span className="mdx-math__tex" dangerouslySetInnerHTML={{ __html: html }} />
      )}
      {hasNote && (
        <span
          id={noteId}
          role="note"
          className={open ? "mdx-math__note mdx-math__note--open" : "mdx-math__note"}
        >
          {step.note}
        </span>
      )}
    </div>
  );
}

export default function Math({ tex, steps, label, caption, numbered = false }: MathProps) {
  const safeSteps = Array.isArray(steps) ? steps : [];
  const headlineHtml = tex2html(tex);

  return (
    <figure className="mdx-figure mdx-math">
      <div className="mdx-math__block">
        {label && <span className="mdx-math__label" aria-hidden="true">{label}</span>}
        <div className="mdx-math__headline">
          <span className="mdx-math__tex" dangerouslySetInnerHTML={{ __html: headlineHtml }} />
        </div>
        {safeSteps.length > 0 && (
          <div className="mdx-math__steps">
            {safeSteps.map((s, i) => (
              <StepRow key={i} step={s} index={i} numbered={numbered} />
            ))}
          </div>
        )}
      </div>
      {caption && <figcaption className="mdx-caption">{caption}</figcaption>}
    </figure>
  );
}
