// apps/site/src/components/mdx/Stepper.tsx
//
// A generic numbered STEP SEQUENCE with a per-step body — the reusable spine
// under teardown mechanisms, primer scaffolds, and build-log instructions. One
// step is visible at a time ("reveal"/"tabs") or all are expanded ("all").
//
// ── Why this is DATA-DRIVEN (serialized props, not MDX children) ─────────────
// Like Scrolly/StatBand, Astro hands MDX children to a React island as opaque
// Astro-JSX nodes it cannot render. So the steps arrive as a SERIALIZABLE
// `steps` prop: each step's `body` (and optional `figure`) is a pre-rendered
// HTML string injected via dangerouslySetInnerHTML. Authoring stays declarative
// in MDX; the island renders inside its own React tree so it hydrates intact.
//
// ── The three invariants this honors ─────────────────────────────────────────
//  • SSR / no-JS fallback that is NEVER blank: renders ALL steps as a semantic
//    <ol> (the reduced-motion default state), so the static HTML carries every
//    step's title + body even before (or without) hydration.
//  • prefers-reduced-motion: zero animation, ALL steps shown (end state).
//  • Prose stays calm at 65ch; the only motion is the panel cross-fade in
//    reveal/tabs mode, which lives inside the figure, never in the prose column.
import { useEffect, useRef, useState } from "react";
import {
  clampStepIndex,
  nextStepIndex,
  prevStepIndex,
  canGoPrev,
  canGoNext,
  stepNumberLabel,
  type StepperMode,
} from "./lib/stepper-index.js";
import "./mdx.css";
import "./Stepper.css";

export interface StepperStep {
  /** The step's title (Fraunces display voice). */
  title: string;
  /** The step's body as a pre-rendered HTML string (prose / figure / code). */
  body: string;
  /** Optional figure HTML (image markup / SVG) shown above the body. */
  figure?: string;
}

export interface StepperProps {
  /** The ordered steps; fully serializable. */
  steps: StepperStep[];
  /**
   * "reveal" (default) and "tabs" show one step at a time with prev/next; "all"
   * expands every step. Under reduced-motion / no-JS every mode shows all steps.
   */
  mode?: StepperMode;
  caption?: string;
}

function prefersReducedMotion(): boolean {
  // SSR / no-matchMedia → treat as reduced so the static render shows ALL steps
  // (the never-blank fallback). Hydration re-checks the real preference.
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A single step's inner content (figure above body), shared by both paths. */
function StepBody({ step }: { step: StepperStep }) {
  return (
    <>
      {step.figure ? (
        <div className="mdx-stepper__figure" dangerouslySetInnerHTML={{ __html: step.figure }} />
      ) : null}
      <div className="mdx-stepper__body" dangerouslySetInnerHTML={{ __html: step.body }} />
    </>
  );
}

export default function Stepper({ steps, mode = "reveal", caption }: StepperProps) {
  const safeSteps = Array.isArray(steps) ? steps : [];
  const [active, setActive] = useState(0);
  // SSR-safe default = reduced → the static HTML is the all-steps <ol> fallback.
  const [reduced, setReduced] = useState(true);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setReduced(prefersReducedMotion()), []);

  // Empty guard: never blank, never throw.
  if (safeSteps.length === 0) {
    return caption ? (
      <figure className="mdx-figure mdx-stepper">
        <figcaption className="mdx-caption">{caption}</figcaption>
      </figure>
    ) : null;
  }

  // ── Fallback: ALL steps as a semantic <ol> ─────────────────────────────────
  // This is the SSR / no-JS render AND the reduced-motion end state AND the
  // author-chosen "all" mode. One code path, always non-blank, zero animation.
  const showAll = reduced || mode === "all";
  if (showAll) {
    return (
      <figure className="mdx-figure mdx-stepper mdx-stepper--all">
        <ol className="mdx-stepper__list">
          {safeSteps.map((step, i) => (
            <li className="mdx-stepper__item" key={i}>
              <div className="mdx-stepper__rail" aria-hidden="true">
                {stepNumberLabel(i)}
              </div>
              <div className="mdx-stepper__content">
                <h4 className="mdx-stepper__title">{step.title}</h4>
                <StepBody step={step} />
              </div>
            </li>
          ))}
        </ol>
        {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
      </figure>
    );
  }

  // ── Interactive: reveal / tabs (one step at a time) ────────────────────────
  const activeIdx = clampStepIndex(active, safeSteps.length);
  const activeStep = safeSteps[activeIdx]!;

  return (
    <figure className={`mdx-figure mdx-stepper mdx-stepper--${mode}`} ref={rootRef}>
      {/* Number rail — amber step markers; tabs mode makes them clickable. */}
      <ol className="mdx-stepper__tabs" role={mode === "tabs" ? "tablist" : undefined}>
        {safeSteps.map((step, i) => {
          const current = i === activeIdx;
          const marker = (
            <>
              <span className="mdx-stepper__tab-num" aria-hidden="true">
                {stepNumberLabel(i)}
              </span>
              <span className="mdx-stepper__tab-title">{step.title}</span>
            </>
          );
          return (
            <li className="mdx-stepper__tab-item" key={i}>
              {mode === "tabs" ? (
                <button
                  type="button"
                  role="tab"
                  aria-selected={current}
                  className={current ? "mdx-stepper__tab mdx-stepper__tab--active" : "mdx-stepper__tab"}
                  onClick={() => setActive(i)}
                >
                  {marker}
                </button>
              ) : (
                <span
                  className={current ? "mdx-stepper__tab mdx-stepper__tab--active" : "mdx-stepper__tab"}
                  aria-current={current ? "step" : undefined}
                >
                  {marker}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {/* The active panel. We render only the active body to keep the DOM light
          in reveal mode; keyed so a fade re-triggers on change. */}
      <div className="mdx-stepper__panel" role={mode === "tabs" ? "tabpanel" : undefined} key={activeIdx}>
        <div className="mdx-stepper__panel-head">
          <span className="mdx-stepper__rail mdx-stepper__rail--active" aria-hidden="true">
            {stepNumberLabel(activeIdx)}
          </span>
          <h4 className="mdx-stepper__title">{activeStep.title}</h4>
        </div>
        <div className="mdx-stepper__content">
          <StepBody step={activeStep} />
        </div>
      </div>

      {/* prev/next controls (reveal & tabs). Disabled at the ends (no wrap). */}
      <div className="mdx-stepper__nav">
        <button
          type="button"
          className="mdx-stepper__btn"
          disabled={!canGoPrev(activeIdx, safeSteps.length)}
          onClick={() => setActive((c) => prevStepIndex(c, safeSteps.length))}
        >
          ← Prev
        </button>
        <span className="mdx-stepper__progress" aria-hidden="true">
          {stepNumberLabel(activeIdx)} / {stepNumberLabel(safeSteps.length - 1)}
        </span>
        <button
          type="button"
          className="mdx-stepper__btn"
          disabled={!canGoNext(activeIdx, safeSteps.length)}
          onClick={() => setActive((c) => nextStepIndex(c, safeSteps.length))}
        >
          Next →
        </button>
      </div>

      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}
