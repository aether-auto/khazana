// apps/site/src/components/mdx/ParameterPlay.tsx
// The GENERALIZED reader-controlled model (design §4.4). Where ControlledChart
// and KellyChart hard-code one formula each, ParameterPlay binds N sliders to an
// AUTHOR-supplied pure formula and plots the live curve + live readouts — so a
// primer/dispatch writer can build a NEW interactive model (a GPS error budget,
// a logistic curve, an orbital period) without a bespoke component.
//
// SECURITY: the `expr` / `readouts[].expr` props are AUTHOR strings that run in
// the READER's page. We NEVER use eval / new Function. Every formula is compiled
// once by the sandboxed shunting-yard evaluator (lib/expr-eval.ts) — only the
// declared params + x variable + a frozen math whitelist are reachable; anything
// else is rejected at compile time and surfaced as a visible author error.
//
// Contracts honoured (same as the two sibling instruments):
//   • SSR / no-JS renders the DEFAULT-parameter curve as inert SVG + a readouts
//     list — never blank. Hydration adds the live sliders.
//   • reduced-motion: sliders still adjust the curve; only the thumb spring is
//     gated (via ControlledChart.css). Nothing animates on a timer.
//   • prose stays calm — all drama lives inside the .mdx-figure frame.
//   • SVG is width:100% (no 360px overflow); the controls grid collapses to one
//     column on narrow screens.
import { useId, useMemo, useState } from "react";
import { scaleLinear } from "@visx/scale";
import { LinePath } from "@visx/shape";
import { Group } from "@visx/group";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { curveMonotoneX } from "@visx/curve";
import {
  bindParams,
  defaultValues,
  compileModel,
  sampleCurve,
  evalReadouts,
  yExtent,
  formatReadout,
  clamp,
  round,
  type PlayParam,
  type PlayReadout,
} from "./lib/parameter-play.js";
import "./mdx.css";
import "./ControlledChart.css";
import "./ParameterPlay.css";

export interface ParameterPlayParam {
  /** identifier used in `expr` / `readouts[].expr` (letters, digits, underscore). */
  key: string;
  label: string;
  min: number;
  max: number;
  default: number;
  step: number;
  unit?: string;
}

export interface ParameterPlayReadout {
  label: string;
  /** pure expression of the params (NOT x) → a scalar. */
  expr: string;
  unit?: string;
}

export interface ParameterPlayProps {
  /** the reader-tunable sliders. */
  params: ParameterPlayParam[];
  /** pure expression of the params + the x variable → y. e.g. "dop * x". */
  expr: string;
  /** the x-variable identifier used in `expr` (default "x"). */
  xVar?: string;
  /** x-axis extent [from, to]. */
  xRange: [number, number];
  xLabel?: string;
  yLabel?: string;
  /** live scalar readouts recomputed on every slider move. */
  readouts?: ParameterPlayReadout[];
  caption?: string;
}

const WIDTH = 640;
const HEIGHT = 320;
const M = { top: 16, right: 20, bottom: 40, left: 56 };
const SAMPLES = 96;

export default function ParameterPlay({
  params,
  expr,
  xVar = "x",
  xRange,
  xLabel,
  yLabel,
  readouts = [],
  caption,
}: ParameterPlayProps) {
  const svgTitleId = useId();

  // Compile ONCE (author strings → validated sandboxed programs). Recompiles only
  // if the author formula/params change (they never do at runtime — props are
  // static per post), so this is effectively build-time-cheap.
  const model = useMemo(
    () => compileModel(expr, params as PlayParam[], xVar, readouts as PlayReadout[]),
    [expr, params, xVar, readouts],
  );

  // Slider state: start at each param's default (clamped).
  const [values, setValues] = useState<Record<string, number>>(() =>
    defaultValues(params as PlayParam[]),
  );
  const bound = useMemo(
    () => bindParams(params as PlayParam[], values),
    [params, values],
  );

  const data = useMemo(
    () => sampleCurve(model, bound, xRange, SAMPLES),
    [model, bound, xRange],
  );
  const liveReadouts = useMemo(() => evalReadouts(model, bound), [model, bound]);

  const innerW = WIDTH - M.left - M.right;
  const innerH = HEIGHT - M.top - M.bottom;

  // x domain is fixed by the author (a stable frame the curve moves within). y
  // domain tracks the sampled extent with `nice` rounding so the axis breathes
  // but never jumps wildly under the reader.
  const xScale = useMemo(
    () => scaleLinear({ domain: [xRange[0], xRange[1]], range: [0, innerW] }),
    [xRange, innerW],
  );
  const [yLo, yHi] = useMemo(() => yExtent(data), [data]);
  const yScale = useMemo(
    () => scaleLinear({ domain: [yLo, yHi], range: [innerH, 0], nice: true }),
    [yLo, yHi, innerH],
  );

  // If the AUTHOR's formula is malformed, show a compact, honest error instead of
  // a silent blank chart. This is authoring feedback, never reader-facing noise
  // in a shipped post (validation catches it before publish).
  const hasError = model.errors.length > 0 || (!!model.yExpr && data.length === 0);

  const readoutText = liveReadouts
    .map((r) => `${r.label}: ${formatReadout(r)}`)
    .join(", ");

  return (
    <figure className="mdx-figure mdx-figure--wide cc pp">
      <div className="mdx-panel cc-panel paper">
        {model.errors.length > 0 ? (
          <p className="pp-error" role="alert">
            ParameterPlay could not compile this model:
            <br />
            {model.errors.join("; ")}
          </p>
        ) : null}

        {/* live readout strip — mono telemetry, updating on every drag */}
        {liveReadouts.length > 0 ? (
          <div className="cc-readout pp-readout" aria-hidden="true">
            {liveReadouts.map((r, i) => (
              <span
                className={`cc-stat${i === 0 ? " cc-stat--accent" : ""}`}
                key={`${r.label}-${i}`}
              >
                <span className="cc-stat-l">{r.label}</span>
                <span className="cc-stat-v tnum">{formatReadout(r)}</span>
              </span>
            ))}
          </div>
        ) : null}

        {/* screen-reader mirror of the live readout (visible strip is aria-hidden) */}
        {readoutText ? (
          <p className="cc-sr-readout" aria-live="polite">
            {readoutText}.
          </p>
        ) : null}

        <svg
          className="cc-svg pp-svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-labelledby={svgTitleId}
        >
          <title id={svgTitleId}>
            {`Curve of ${yLabel ?? "y"} against ${xLabel ?? xVar}${
              readoutText ? `. ${readoutText}` : ""
            }.`}
          </title>
          <Group left={M.left} top={M.top}>
            {/* zero rule when the curve straddles it — a quiet reference line */}
            {yLo < 0 && yHi > 0 ? (
              <line
                x1={0}
                x2={innerW}
                y1={yScale(0)}
                y2={yScale(0)}
                className="pp-zero"
              />
            ) : null}

            {data.length > 1 ? (
              <LinePath
                data={data}
                x={(d) => xScale(d.x)}
                y={(d) => yScale(d.y)}
                curve={curveMonotoneX}
                className="cc-line"
              />
            ) : null}

            {hasError && data.length <= 1 ? (
              <text
                x={innerW / 2}
                y={innerH / 2}
                className="pp-empty"
                textAnchor="middle"
              >
                no plottable curve
              </text>
            ) : null}

            <AxisLeft
              scale={yScale}
              numTicks={4}
              hideAxisLine
              tickClassName="cc-tick"
              tickLength={4}
              label={yLabel}
              labelClassName="cc-axis-label"
            />
            <AxisBottom
              scale={xScale}
              top={innerH}
              numTicks={6}
              hideAxisLine
              tickClassName="cc-tick"
              tickLength={4}
              label={xLabel ?? xVar}
              labelClassName="cc-axis-label"
            />
          </Group>
        </svg>

        {/* the instrument controls — a grid that collapses to one column on mobile */}
        <div className="pp-controls">
          {params.map((p) => (
            <SliderControl
              key={p.key}
              param={p}
              value={bound[p.key] ?? p.default}
              onChange={(v) =>
                setValues((prev) => ({ ...prev, [p.key]: clamp(v, p.min, p.max) }))
              }
            />
          ))}
        </div>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}

function SliderControl({
  param,
  value,
  onChange,
}: {
  param: ParameterPlayParam;
  value: number;
  onChange: (v: number) => void;
}) {
  const id = useId();
  const decimals = stepDecimals(param.step);
  return (
    <div className="cc-control pp-control">
      <label htmlFor={id} className="cc-control-label pp-control-label">
        <span>{param.label}</span>
        <span className="pp-control-val tnum">
          {round(value, decimals)}
          {param.unit ? ` ${param.unit}` : ""}
        </span>
      </label>
      <input
        id={id}
        className="cc-slider"
        type="range"
        min={param.min}
        max={param.max}
        step={param.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/** How many decimals to show for a value, inferred from the slider step. */
function stepDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 2;
  const s = String(step);
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : Math.min(4, s.length - dot - 1);
}
