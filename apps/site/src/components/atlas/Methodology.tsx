// apps/site/src/components/atlas/Methodology.tsx
//
// Shared Atlas provenance panel (Phase A8: Extras). Every World Data Spine
// datum carries a `Provenance` object; this is the ONE component that renders
// it — source, method citation, license posture, retrieval freshness, and an
// honest uncertainty summary — so the Globe, Bias Lab, Country Report /
// Indicator Browser, and World Sources Explorer never each invent a slightly
// different explanation of the same datum. See docs/cofounder/specs/tasks/
// methodology-panel.json and packages/core/src/world-provenance.ts.
//
// Deliberately dumb: a pure function of its `provenance` prop. No client-side
// fetching, no useState/useEffect, no surface-specific branching. Progressive
// disclosure is native <details>/<summary> so the source id and freshness are
// visible immediately and the full citation + uncertainty detail is available
// with zero JavaScript.
import type { Provenance, Uncertainty } from "@khazana/core";
import "./Methodology.css";

export interface MethodologyProps {
  provenance: Provenance;
  /** Open the disclosure by default (rare — most call sites want it collapsed). */
  defaultOpen?: boolean;
}

/** Plain-language license posture. Never implies a raw-OK source's specific
 * datum is itself raw — `origin`/`redistribution` state that separately. */
function licenseCopy(tier: Provenance["licenseTier"]): string {
  return tier === "redistribute-raw-ok"
    ? "raw values may be redistributed by this source"
    : "derived/computed values only — this source's raw values may not be redistributed";
}

/** States the ACTUAL provenance of the rendered datum, independent of what the
 * source's license tier merely permits. */
function originCopy(p: Provenance): string {
  if (p.origin === "computed") {
    return p.redistribution
      ? "khazana-computed from this source's inputs"
      : "khazana-computed — not a raw redistribution";
  }
  return p.redistribution
    ? "raw value redistributed as published by this source"
    : "referenced from this source's published table";
}

/** Deterministic, UTC, no-JS-independent freshness label — never a relative
 * "x days ago" string, since that would be non-deterministic across renders. */
function formatRetrievedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${date}, ${time} UTC`;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

/** Honest, human-readable copy per Uncertainty discriminant. Never fabricates
 * a range for a variant that doesn't provide one — `none` says so plainly. */
function UncertaintySummary({ uncertainty }: { uncertainty: Uncertainty }) {
  switch (uncertainty.kind) {
    case "confidenceInterval": {
      const pct = Math.round(uncertainty.level * 100);
      return (
        <p className="mth-uncertainty">
          <span className="mth-uncertainty-kind">confidence interval:</span>{" "}
          {uncertainty.low}–{uncertainty.high} at {pct}% confidence
        </p>
      );
    }
    case "standardError":
      return (
        <p className="mth-uncertainty">
          <span className="mth-uncertainty-kind">standard error:</span> ± {uncertainty.se}
        </p>
      );
    case "raterSpread":
      return (
        <p className="mth-uncertainty">
          <span className="mth-uncertainty-kind">rater spread:</span> {uncertainty.min}–{uncertainty.max} across{" "}
          {formatNumber(uncertainty.raterCount)} rater{uncertainty.raterCount === 1 ? "" : "s"}
        </p>
      );
    case "sampleSize":
      return (
        <p className="mth-uncertainty">
          <span className="mth-uncertainty-kind">sample size:</span> n = {formatNumber(uncertainty.n)}
        </p>
      );
    case "none":
      return (
        <p className="mth-uncertainty mth-uncertainty--none">
          <span className="mth-uncertainty-kind">no stated uncertainty</span> — this source published no error
          margin for this datum.
        </p>
      );
  }
}

export default function Methodology({ provenance, defaultOpen = false }: MethodologyProps) {
  return (
    <details className="mth" open={defaultOpen}>
      <summary className="mth-summary">
        <span className="mth-source-id">{provenance.sourceId}</span>
        <span className="mth-freshness">retrieved {formatRetrievedAt(provenance.retrievedAt)}</span>
      </summary>
      <div className="mth-body">
        <dl className="mth-grid">
          <dt>source</dt>
          <dd>
            <a className="mth-link" href={provenance.sourceUrl} target="_blank" rel="noopener noreferrer">
              {provenance.sourceUrl}
            </a>
          </dd>

          <dt>method</dt>
          <dd>
            <a className="mth-link" href={provenance.methodUrl} target="_blank" rel="noopener noreferrer">
              {provenance.methodUrl}
            </a>
          </dd>

          <dt>license</dt>
          <dd>{licenseCopy(provenance.licenseTier)}</dd>

          <dt>this datum</dt>
          <dd>{originCopy(provenance)}</dd>
        </dl>
        <UncertaintySummary uncertainty={provenance.uncertainty} />
      </div>
    </details>
  );
}
