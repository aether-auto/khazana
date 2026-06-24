// apps/site/src/components/mdx/Scrolly.tsx
import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import scrollama from "scrollama";
import { resolveActiveStep } from "./lib/scrolly-state.js";
import "./mdx.css";
import "./Scrolly.css";

export interface ScrollyStepProps {
  /** The graphic shown in the sticky pane while this step is active. */
  graphic: ReactNode;
  children?: ReactNode;
}

/** Declarative step. Rendered by <Scrolly>; not standalone. */
export function ScrollyStep(_props: ScrollyStepProps): ReactElement | null {
  return null; // <Scrolly> reads props directly; this never self-renders.
}

export interface ScrollyProps {
  children?: ReactNode;
  caption?: string;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true; // SSR -> stacked fallback
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function Scrolly({ children, caption }: ScrollyProps) {
  const steps = Children.toArray(children).filter(
    (c): c is ReactElement<ScrollyStepProps> => isValidElement(c) && c.type === ScrollyStep,
  );
  const [active, setActive] = useState(0);
  const [reduced, setReduced] = useState(true); // SSR-safe default = stacked
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setReduced(prefersReducedMotion()), []);

  useEffect(() => {
    if (reduced || !rootRef.current) return;
    const scroller = scrollama();
    scroller
      .setup({
        step: rootRef.current.querySelectorAll<HTMLElement>(".scrolly-step"),
        offset: 0.6,
      })
      .onStepEnter((res: { index: number }) =>
        setActive((current) => resolveActiveStep({ entered: res.index, count: steps.length, current })),
      );
    const onResize = () => scroller.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      scroller.destroy();
    };
  }, [reduced, steps.length]);

  // Stacked fallback (SSR, no-JS, reduced motion): graphic above its prose.
  if (reduced) {
    return (
      <figure className="mdx-figure mdx-figure--wide scrolly scrolly--stacked">
        {steps.map((s, i) => (
          <div className="scrolly-stacked-step" key={i}>
            <div className="mdx-panel scrolly-graphic">{s.props.graphic}</div>
            <div className="scrolly-prose">{s.props.children}</div>
          </div>
        ))}
        {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
      </figure>
    );
  }

  return (
    <figure className="mdx-figure mdx-figure--wide scrolly" ref={rootRef}>
      <div className="scrolly-grid">
        <div className="scrolly-sticky">
          <div className="mdx-panel scrolly-graphic">{steps[active]?.props.graphic}</div>
        </div>
        <div className="scrolly-steps">
          {steps.map((s, i) => (
            <div className={i === active ? "scrolly-step scrolly-step--active" : "scrolly-step"} key={i}>
              {s.props.children}
            </div>
          ))}
        </div>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}
