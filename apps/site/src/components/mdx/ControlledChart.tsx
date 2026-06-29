// apps/site/src/components/mdx/ControlledChart.tsx
// The reader-CONTROLLED chart (art-direction §5, the deepest form of
// "interactive"): a slider recomputes the visualization LIVE. Built on visx
// (SVG, MIT) so we own every pixel and keep it within the two-register system.
//
// The drama lives HERE, in the figure — never in the prose column. The figure
// sits inside the standard .mdx-figure frame; the reader steers a decay model
// (the shape behind "compute keeps getting cheaper") and watches the curve, the
// half-life, and the crossover month update instantly.
//
// Contracts honoured: SSR/no-JS renders a readable static summary + the initial
// curve as inert SVG; hydration adds the live slider. Animates nothing on a
// timer (recompute is user-driven). Reduced-motion users still get full control
// — the only thing gated is the spring tween on the path, replaced by a snap.
import { useId, useMemo, useState } from "react";
import { scaleLinear } from "@visx/scale";
import { LinePath, AreaClosed } from "@visx/shape";
import { Group } from "@visx/group";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { curveMonotoneX } from "@visx/curve";
import {
  decayCurve,
  halfLife,
  crossover,
  clamp,
  round,
  type DecayParams,
} from "./lib/model-curve.js";
import "./mdx.css";
import "./ControlledChart.css";

export interface ControlledChartProps {
  /** today's marginal cost (curve start). */
  start?: number;
  /** asymptotic floor the curve approaches but never beats. */
  floor?: number;
  /** initial decay rate; the slider steers this. */
  rate?: number;
  /** x-axis extent in months. */
  span?: number;
  /** a constant the curve must drop below — drives the live crossover readout. */
  threshold?: number;
  /** y-axis unit label, e.g. "$/M tok". */
  unit?: string;
  caption?: string;
}

const WIDTH = 640;
const HEIGHT = 320;
const M = { top: 16, right: 20, bottom: 36, left: 52 };
const SAMPLES = 48;

export default function ControlledChart({
  start = 3,
  floor = 0.5,
  rate = 0.2,
  span = 24,
  threshold = 1,
  unit = "$/M tok",
  caption,
}: ControlledChartProps) {
  const [liveRate, setLiveRate] = useState(rate);
  const sliderId = useId();

  const params: DecayParams = useMemo(
    () => ({ start, floor, rate: liveRate, samples: SAMPLES, span }),
    [start, floor, liveRate, span],
  );
  const data = useMemo(() => decayCurve(params), [params]);

  const innerW = WIDTH - M.left - M.right;
  const innerH = HEIGHT - M.top - M.bottom;

  // Fixed domains (start/floor) so the curve animates within a STABLE frame as
  // the reader drags — the axis never jumps under them.
  const xScale = useMemo(
    () => scaleLinear({ domain: [0, span], range: [0, innerW] }),
    [span, innerW],
  );
  const yScale = useMemo(
    () => scaleLinear({ domain: [floor * 0.9, start * 1.02], range: [innerH, 0], nice: true }),
    [floor, start, innerH],
  );

  const hl = halfLife(liveRate);
  const cross = crossover(params, threshold);
  const thresholdY = yScale(threshold);

  return (
    <figure className="mdx-figure mdx-figure--wide cc">
      <div className="mdx-panel cc-panel paper">
        <div className="cc-readout" aria-hidden="true">
          <span className="cc-stat">
            <span className="cc-stat-l">rate</span>
            <span className="cc-stat-v tnum">{round(liveRate, 2)}/mo</span>
          </span>
          <span className="cc-stat">
            <span className="cc-stat-l">half-life</span>
            <span className="cc-stat-v tnum">
              {Number.isFinite(hl) ? `${round(hl, 1)} mo` : "—"}
            </span>
          </span>
          <span className="cc-stat cc-stat--accent">
            <span className="cc-stat-l">crosses {threshold}</span>
            <span className="cc-stat-v tnum">
              {cross == null ? "never" : cross === 0 ? "already" : `mo ${round(cross, 1)}`}
            </span>
          </span>
        </div>

        {/* Screen-reader mirror of the live readout — the visible strip is
            aria-hidden, so this polite region announces each recompute. */}
        <p className="cc-sr-readout" aria-live="polite">
          {`Decay rate ${round(liveRate, 2)} per month, half-life ${
            Number.isFinite(hl) ? `${round(hl, 1)} months` : "infinite"
          }. Cost ${
            cross == null
              ? `never crosses ${threshold} ${unit}`
              : cross === 0
                ? `is already below ${threshold} ${unit}`
                : `crosses ${threshold} ${unit} at month ${round(cross, 1)}`
          }.`}
        </p>

        <svg
          className="cc-svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`Decay curve: cost falls from ${start} toward ${floor} ${unit} at rate ${round(
            liveRate,
            2,
          )} per month.`}
        >
          <Group left={M.left} top={M.top}>
            {/* threshold rule — the line the reader is trying to cross under */}
            <line
              x1={0}
              x2={innerW}
              y1={thresholdY}
              y2={thresholdY}
              className="cc-threshold"
            />
            <text x={innerW} y={thresholdY - 5} className="cc-threshold-label" textAnchor="end">
              {threshold} {unit}
            </text>

            <AreaClosed
              data={data}
              x={(d) => xScale(d.x)}
              y={(d) => yScale(d.y)}
              yScale={yScale}
              curve={curveMonotoneX}
              className="cc-area"
            />
            <LinePath
              data={data}
              x={(d) => xScale(d.x)}
              y={(d) => yScale(d.y)}
              curve={curveMonotoneX}
              className="cc-line"
            />

            {/* crossover marker (only when it happens within span) */}
            {cross != null && cross > 0 && cross <= span && (
              <g className="cc-cross">
                <line x1={xScale(cross)} x2={xScale(cross)} y1={0} y2={innerH} className="cc-cross-rule" />
                <circle cx={xScale(cross)} cy={thresholdY} r={4} className="cc-cross-dot" />
              </g>
            )}

            <AxisLeft
              scale={yScale}
              numTicks={4}
              hideAxisLine
              tickClassName="cc-tick"
              tickLength={4}
              label={unit}
              labelClassName="cc-axis-label"
            />
            <AxisBottom
              scale={xScale}
              top={innerH}
              numTicks={6}
              hideAxisLine
              tickClassName="cc-tick"
              tickLength={4}
              label="months"
              labelClassName="cc-axis-label"
            />
          </Group>
        </svg>

        <div className="cc-control">
          <label htmlFor={sliderId} className="cc-control-label">
            decay rate — drag to steer the model
          </label>
          <input
            id={sliderId}
            className="cc-slider"
            type="range"
            min={0}
            max={0.6}
            step={0.01}
            value={liveRate}
            onChange={(e) => setLiveRate(clamp(Number(e.target.value), 0, 0.6))}
          />
        </div>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}
