// apps/site/src/components/mdx/KellyChart.tsx
// The reader-CONTROLLED Kelly chart (art-direction §5, the deepest form of
// "interactive"): two sliders recompute the growth-rate curve LIVE. The reader
// steers a bet — its win probability and its payoff odds — and watches the
// long-run growth-rate parabola, the optimal fraction f*, and the peak growth
// rate update instantly. The drama lives HERE, in the figure, never in the prose.
//
// All math is Thorp's, factored into the pure, tested `kelly-curve` lib so this
// island stays a thin shell. SSR/no-JS renders a readable static summary + the
// initial curve as inert SVG; hydration adds the live sliders. Nothing animates
// on a timer — every recompute is user-driven, so reduced-motion readers keep
// full control (only the thumb's hover spring is gated).
import { useId, useMemo, useState } from "react";
import { scaleLinear } from "@visx/scale";
import { LinePath, AreaClosed } from "@visx/shape";
import { Group } from "@visx/group";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { curveMonotoneX } from "@visx/curve";
import {
  growthCurve,
  kellyFraction,
  growthRate,
  edge,
  drawdownProb,
  clamp,
  round,
} from "./lib/kelly-curve.js";
import "./mdx.css";
import "./ControlledChart.css";
import "./KellyChart.css";

export interface KellyChartProps {
  /** initial win probability (0.5–0.95). The first slider steers this. */
  p?: number;
  /** initial payoff odds b (win b units per 1 staked). The second slider steers this. */
  b?: number;
  caption?: string;
}

const WIDTH = 640;
const HEIGHT = 320;
const M = { top: 16, right: 20, bottom: 36, left: 52 };
const SAMPLES = 64;

export default function KellyChart({ p = 0.6, b = 1, caption }: KellyChartProps) {
  const [liveP, setLiveP] = useState(p);
  const [liveB, setLiveB] = useState(b);
  const pId = useId();
  const bId = useId();

  const fStar = kellyFraction(liveP, liveB);
  const gStar = growthRate(liveP, liveB, fStar);
  const ev = edge(liveP, liveB);

  // Plot the parabola out to a touch past the ruin point (~2·f*) so the reader
  // sees growth turn negative — the whole point of the figure. Floor the window
  // so a tiny/zero edge still gives a legible frame.
  const fMax = useMemo(() => clamp(Math.max(fStar * 2.6, 0.1), 0.1, 0.999), [fStar]);
  const data = useMemo(
    () => growthCurve(liveP, liveB, fMax, SAMPLES),
    [liveP, liveB, fMax],
  );

  const innerW = WIDTH - M.left - M.right;
  const innerH = HEIGHT - M.top - M.bottom;

  const xScale = useMemo(
    () => scaleLinear({ domain: [0, fMax], range: [0, innerW] }),
    [fMax, innerW],
  );
  // Symmetric-ish y-domain anchored on the peak so the curve breathes as the
  // reader drags, but the zero line stays put (growth turning negative reads).
  const yScale = useMemo(() => {
    const top = Math.max(gStar * 1.25, 0.01);
    return scaleLinear({ domain: [-top, top], range: [innerH, 0], nice: true });
  }, [gStar, innerH]);

  const zeroY = yScale(0);
  const fStarX = xScale(Math.min(fStar, fMax));

  return (
    <figure className="mdx-figure mdx-figure--wide cc kc">
      <div className="mdx-panel cc-panel paper">
        <div className="cc-readout" aria-hidden="true">
          <span className="cc-stat">
            <span className="cc-stat-l">edge</span>
            <span className="cc-stat-v tnum">{ev > 0 ? "+" : ""}{round(ev * 100, 1)}%</span>
          </span>
          <span className="cc-stat cc-stat--accent">
            <span className="cc-stat-l">optimal bet f*</span>
            <span className="cc-stat-v tnum">
              {fStar <= 0 ? "0 (skip)" : `${round(fStar * 100, 1)}%`}
            </span>
          </span>
          <span className="cc-stat">
            <span className="cc-stat-l">growth / bet</span>
            <span className="cc-stat-v tnum">
              {fStar <= 0 ? "—" : `${round(gStar * 100, 2)}%`}
            </span>
          </span>
          <span className="cc-stat">
            <span className="cc-stat-l">P(ever −50%)</span>
            <span className="cc-stat-v tnum">{round(drawdownProb(0.5, 1) * 100, 0)}%</span>
          </span>
        </div>

        <svg
          className="cc-svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`Long-run growth rate versus bet fraction. With a ${round(
            liveP * 100,
            0,
          )}% win chance at ${round(liveB, 1)}-to-1 odds, growth peaks at a bet of ${round(
            fStar * 100,
            1,
          )}% of bankroll and turns negative if you bet much more.`}
        >
          <Group left={M.left} top={M.top}>
            {/* zero rule — bet to the left of f* and you grow; cross under it
                (over-bet past ~2·f*) and the bankroll trends to zero. */}
            <line x1={0} x2={innerW} y1={zeroY} y2={zeroY} className="cc-threshold" />
            <text x={innerW} y={zeroY - 5} className="cc-threshold-label" textAnchor="end">
              break-even growth
            </text>

            <AreaClosed
              data={data.filter((d) => Number.isFinite(d.y) && d.y > -90)}
              x={(d) => xScale(d.x)}
              y={(d) => yScale(Math.max(d.y, yScale.domain()[0]))}
              yScale={yScale}
              curve={curveMonotoneX}
              className="cc-area kc-area"
            />
            <LinePath
              data={data.filter((d) => Number.isFinite(d.y) && d.y > -90)}
              x={(d) => xScale(d.x)}
              y={(d) => yScale(Math.max(d.y, yScale.domain()[0]))}
              curve={curveMonotoneX}
              className="cc-line"
            />

            {/* f* marker — the peak of the parabola, the reader's target */}
            {fStar > 0 && (
              <g className="cc-cross">
                <line x1={fStarX} x2={fStarX} y1={0} y2={innerH} className="cc-cross-rule" />
                <circle cx={fStarX} cy={yScale(gStar)} r={4} className="cc-cross-dot kc-peak" />
                <text x={fStarX} y={yScale(gStar) - 9} className="kc-peak-label" textAnchor="middle">
                  f*
                </text>
              </g>
            )}

            <AxisLeft
              scale={yScale}
              numTicks={4}
              hideAxisLine
              tickClassName="cc-tick"
              tickLength={4}
              label="growth/bet"
              labelClassName="cc-axis-label"
            />
            <AxisBottom
              scale={xScale}
              top={innerH}
              numTicks={6}
              hideAxisLine
              tickClassName="cc-tick"
              tickLength={4}
              label="fraction of bankroll bet"
              labelClassName="cc-axis-label"
            />
          </Group>
        </svg>

        <div className="kc-controls">
          <div className="cc-control">
            <label htmlFor={pId} className="cc-control-label">
              win probability — {round(liveP * 100, 0)}%
            </label>
            <input
              id={pId}
              className="cc-slider"
              type="range"
              min={0.5}
              max={0.95}
              step={0.01}
              value={liveP}
              onChange={(e) => setLiveP(clamp(Number(e.target.value), 0.5, 0.95))}
            />
          </div>
          <div className="cc-control">
            <label htmlFor={bId} className="cc-control-label">
              payoff odds — {round(liveB, 1)}-to-1
            </label>
            <input
              id={bId}
              className="cc-slider"
              type="range"
              min={0.2}
              max={5}
              step={0.1}
              value={liveB}
              onChange={(e) => setLiveB(clamp(Number(e.target.value), 0.2, 5))}
            />
          </div>
        </div>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}
