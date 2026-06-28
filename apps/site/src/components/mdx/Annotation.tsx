// apps/site/src/components/mdx/Annotation.tsx
import { useId, useMemo, useState, type ReactNode } from "react";
import katex from "katex";
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
 * Reveals on hover AND keyboard focus; note linked via aria-describedby so the
 * SSR/no-JS path still exposes it to assistive tech. Math terms are typeset
 * with KaTeX (palette-themed in code.css) rather than printed as monospace.
 */
export default function Annotation({ term, note, math = false, children }: AnnotationProps) {
  const noteId = useId();
  const [open, setOpen] = useState(false);

  // Typeset the math term once. `throwOnError: false` keeps a malformed term
  // from blowing up the island — KaTeX renders the source in an error color.
  const mathHtml = useMemo(
    () => (math ? katex.renderToString(term, { throwOnError: false, displayMode: false }) : null),
    [math, term],
  );

  return (
    <span className="mdx-annot">
      <button
        type="button"
        className={math ? "mdx-annot__term mdx-annot__term--math" : "mdx-annot__term"}
        aria-describedby={noteId}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {math && mathHtml ? (
          <span className="mdx-annot__math" aria-label={term} dangerouslySetInnerHTML={{ __html: mathHtml }} />
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
