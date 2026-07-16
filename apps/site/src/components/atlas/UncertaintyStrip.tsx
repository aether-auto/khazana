import type { Uncertainty } from "@khazana/core";
import { uncertaintyStripReadout } from "../../lib/atlas/uncertainty-strip.js";
import { formatRangeValue, layoutRangePlot } from "../mdx/lib/rangeplot-scale.js";
import "./UncertaintyStrip.css";

export interface UncertaintyStripProps {
  score: number;
  uncertainty: Uncertainty;
  n: number;
  label?: string;
}

const VIEW_WIDTH = 320;

export default function UncertaintyStrip({ score, uncertainty, n, label }: UncertaintyStripProps) {
  const readout = uncertaintyStripReadout(score, uncertainty, n, label);

  return (
    <section className="uncertainty-strip" aria-label="Uncertainty readout">
      {"rangeDatum" in readout ? <RangeReadout readout={readout} /> : null}
      {readout.kind === "sampleSize" ? (
        <span className="uncertainty-strip__badge" data-uncertainty-sample-size="true">
          n={readout.statedSampleSize}
        </span>
      ) : null}
      {readout.kind === "none" ? <span className="uncertainty-strip__none">no uncertainty reported</span> : null}
      <div className="uncertainty-strip__meta">
        <span className="uncertainty-strip__sample">n={readout.sampleCount}</span>
        <a href="/atlas/bias-lab/methodology#icr-floor">methodology</a>
      </div>
    </section>
  );
}

function RangeReadout({ readout }: { readout: Extract<ReturnType<typeof uncertaintyStripReadout>, { rangeDatum: unknown }> }) {
  const layout = layoutRangePlot([readout.rangeDatum], {
    width: VIEW_WIDTH,
    labelGutter: 16,
    rightPad: 16,
    topPad: 6,
    rowStep: 22,
  });
  const [row] = layout.rows;

  if (!row) throw new Error("UncertaintyStrip requires one laid-out range row");

  return (
    <div className="uncertainty-strip__range" data-uncertainty-range="true">
      <svg
        className="uncertainty-strip__svg"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label={`${row.label}: ${formatRangeValue(row.low)} to ${formatRangeValue(row.high)}, mid ${formatRangeValue(row.mid)}${row.n === undefined ? "" : `, n=${row.n}`}`}
      >
        <line className="uncertainty-strip__line" x1={row.xLow} y1={row.y} x2={row.xHigh} y2={row.y} />
        <line className="uncertainty-strip__cap" x1={row.xLow} y1={row.y - 4} x2={row.xLow} y2={row.y + 4} />
        <line className="uncertainty-strip__cap" x1={row.xHigh} y1={row.y - 4} x2={row.xHigh} y2={row.y + 4} />
        <circle className="uncertainty-strip__mid" cx={row.xMid} cy={row.y} r={3.5} />
      </svg>
      <p className="uncertainty-strip__values">
        <span data-uncertainty-low="true">low {formatRangeValue(row.low)}</span>
        <span data-uncertainty-mid="true">mid {formatRangeValue(row.mid)}</span>
        <span data-uncertainty-high="true">high {formatRangeValue(row.high)}</span>
        {row.n === undefined ? null : <span data-uncertainty-rater-count="true">n={row.n}</span>}
      </p>
    </div>
  );
}
