// apps/site/src/components/mdx/Sidenote.tsx
// Margin citations as real marginalia (art-direction §5): a small-caps numbered
// superscript in the prose that surfaces its source as a MARGIN NOTE on wide
// screens, and folds inline (a quiet expandable footnote) on narrow ones.
//
// This is editorial apparatus, not animation — it lives in the prose register
// but is itself the INSTRUMENT voice (mono, numbered), so the reading body stays
// calm while the citation reads as the observatory's annotation. No JS motion;
// the only interaction is a native <details> on small screens. SSR-complete.
import { useId } from "react";
import "./Sidenote.css";

export interface SidenoteProps {
  /** running number shown as the superscript + margin marker. */
  n?: number;
  /** the note body (a citation, an aside, a definition). */
  children: React.ReactNode;
  /** optional source link surfaced in the note. */
  href?: string;
  /** optional source label for the link. */
  source?: string;
}

export default function Sidenote({ n, children, href, source }: SidenoteProps) {
  const id = useId();
  const marker = n != null ? String(n) : "*";

  return (
    <span className="sidenote">
      <sup className="sidenote-ref" aria-describedby={id}>
        {marker}
      </sup>
      {/* wide screens: rendered into the margin via CSS (float on the gutter).
          narrow screens: a native <details> toggles it inline. Both share text. */}
      <small className="sidenote-body" id={id} role="note">
        <span className="sidenote-num" aria-hidden="true">
          {marker}
        </span>
        <span className="sidenote-text">
          {children}
          {href ? (
            <>
              {" "}
              <a className="sidenote-src" href={href} rel="noopener noreferrer">
                {source ?? "source"}
              </a>
            </>
          ) : null}
        </span>
      </small>
    </span>
  );
}
