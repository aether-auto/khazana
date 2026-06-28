// apps/site/src/components/mdx/NarrativeScene.tsx
//
// True scrollytelling for NARRATIVE — history, geopolitics, geography, science.
// A sticky VISUAL pane + stepped prose; the pinned visual changes per step with
// a cross-fade (opacity only, no layout thrash). Where <Scrolly> only swaps a
// chart, NarrativeScene pins a small UNION of serializable panels — a map with
// per-step highlighted regions (an animated geographic narrative), a chart, or
// a typographic "scene" — so a story can move across a map, then to data, then
// to a title card, all in one pinned frame.
//
// ── Why this is DATA-DRIVEN (mirrors Scrolly.tsx) ────────────────────────────
// Astro hands MDX children to a React island as opaque virtual nodes it cannot
// introspect or render. So steps are a SERIALIZABLE `steps` prop (plain panel
// specs + prose HTML strings); NarrativeScene renders the panels in its OWN
// React tree (no nested Astro island boundary), so the Map/Chart hydrate with
// the island. Authoring stays declarative in MDX.
//
// ── Why all panels mount at once (the cross-fade) ────────────────────────────
// The sticky pane stacks ALL panels and toggles each one's opacity by active
// step. Mounting/unmounting per step would re-initialize the Map's projection
// and the Chart's Plot render on every step — layout thrash + flicker. Stacked
// + opacity is GPU-cheap and never re-lays-out. SSR/no-JS/reduced-motion fall
// back to a calm STACKED layout (each panel above its prose), like Scrolly.
import { useEffect, useRef, useState } from "react";
import scrollama from "scrollama";
import Chart from "./Chart.js";
import Map from "./Map.js";
import { resolveActiveStep, safeActiveStep } from "./lib/scrolly-state.js";
import { regionValues, type NarrativeStep, type PanelSpec } from "./lib/narrative-scene.js";
import "./mdx.css";
import "./NarrativeScene.css";

export interface NarrativeSceneProps {
  /** the ordered steps; each pairs a serializable panel spec with prose HTML. */
  steps: NarrativeStep[];
  caption?: string;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true; // SSR -> stacked fallback
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Render one panel spec into the scene's own React tree. */
function Panel({ panel }: { panel: PanelSpec }) {
  switch (panel.kind) {
    case "map":
      return <Map values={regionValues(panel)} caption={panel.caption} />;
    case "chart": {
      // Strip the discriminant; the rest is a valid ChartProps for <Chart>.
      const { kind: _kind, ...chartProps } = panel;
      return <Chart {...chartProps} />;
    }
    case "scene":
      return (
        <div className="ns-scene" role="img" aria-label={panel.headline}>
          <div className="ns-scene-frame">
            {panel.kicker ? <span className="ns-scene-kicker">{panel.kicker}</span> : null}
            <span className="ns-scene-headline">{panel.headline}</span>
            {panel.sub ? <span className="ns-scene-sub">{panel.sub}</span> : null}
            <span className="ns-scene-rule" aria-hidden="true" />
          </div>
        </div>
      );
  }
}

export default function NarrativeScene({ steps, caption }: NarrativeSceneProps) {
  const safeSteps = Array.isArray(steps) ? steps : [];
  const [active, setActive] = useState(0);
  const [reduced, setReduced] = useState(true); // SSR-safe default = stacked
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setReduced(prefersReducedMotion()), []);

  useEffect(() => {
    if (reduced || !rootRef.current || safeSteps.length === 0) return;
    const scroller = scrollama();
    scroller
      .setup({
        step: rootRef.current.querySelectorAll<HTMLElement>(".ns-step"),
        offset: 0.6,
      })
      .onStepEnter((res: { index: number }) =>
        setActive((current) =>
          resolveActiveStep({ entered: res.index, count: safeSteps.length, current }),
        ),
      );
    const onResize = () => scroller.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      scroller.destroy();
    };
  }, [reduced, safeSteps.length]);

  // Guard: empty steps → never blank, never throws.
  if (safeSteps.length === 0) {
    return caption ? (
      <figure className="mdx-figure mdx-figure--wide ns ns--stacked">
        <figcaption className="mdx-caption">{caption}</figcaption>
      </figure>
    ) : null;
  }

  // Stacked fallback (SSR, no-JS, reduced motion): panel above its prose. This
  // is what renders into the static HTML, so the figure is NEVER blank.
  if (reduced) {
    return (
      <figure className="mdx-figure mdx-figure--wide ns ns--stacked">
        {safeSteps.map((s, i) => (
          <div className="ns-stacked-step" key={i}>
            <div className="ns-graphic">
              <Panel panel={s.panel} />
            </div>
            <div className="ns-prose" dangerouslySetInnerHTML={{ __html: s.prose }} />
          </div>
        ))}
        {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
      </figure>
    );
  }

  const activeIdx = safeActiveStep(active, safeSteps.length) ?? 0;

  return (
    <figure className="mdx-figure mdx-figure--wide ns" ref={rootRef}>
      <div className="ns-grid">
        <div className="ns-sticky">
          {/* ALL panels mounted; opacity cross-fade selects the active one. */}
          <div className="ns-stage">
            {safeSteps.map((s, i) => (
              <div
                className={i === activeIdx ? "ns-panel ns-panel--active" : "ns-panel"}
                key={i}
                aria-hidden={i === activeIdx ? undefined : true}
              >
                <Panel panel={s.panel} />
              </div>
            ))}
          </div>
        </div>
        <div className="ns-steps">
          {safeSteps.map((s, i) => (
            <div
              className={i === activeIdx ? "ns-step ns-step--active" : "ns-step"}
              key={i}
              dangerouslySetInnerHTML={{ __html: s.prose }}
            />
          ))}
        </div>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}
