// apps/site/src/components/mdx/Annotation.tsx
import { useId, useState, type ReactNode } from "react";
import "./mdx.css";
import "./Annotation.css";

export interface AnnotationProps {
  /** The inline term being annotated. */
  term: string;
  /** Margin-note / popover text. Plain string (kept short, reading-voice). */
  note: string;
  /** Optional richer children rendered inside the note instead of `note`. */
  children?: ReactNode;
}

/**
 * Inline annotated term with an accessible popover note.
 * Reveals on hover AND keyboard focus; note linked via aria-describedby so the
 * SSR/no-JS path still exposes it to assistive tech.
 */
export default function Annotation({ term, note, children }: AnnotationProps) {
  const noteId = useId();
  const [open, setOpen] = useState(false);

  return (
    <span className="mdx-annot">
      <button
        type="button"
        className="mdx-annot__term"
        aria-describedby={noteId}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {term}
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
