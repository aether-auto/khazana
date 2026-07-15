// apps/site/src/components/mdx/PowerFlow.tsx
import { useState } from "react";
import { POWER_RELATIONS } from "@khazana/core";
import type { GovernmentStructure, PowerRelation } from "@khazana/core";
import {
  layoutPowerFlow,
  type PowerFlowInstitution,
} from "./lib/power-flow-layout.js";
import "./mdx.css";
import "./PowerFlow.css";

export interface PowerFlowProps {
  /** The assembled, per-country government structure (from @khazana/core). */
  structure: GovernmentStructure;
  caption?: string;
  /**
   * When true (default), hovering/focusing an institution dims the rest of the
   * diagram and lights its incident power-flow edges. Set false for a purely
   * static figure — the no-JS render is identical either way.
   */
  highlightOnHover?: boolean;
}

// Arrowhead marker geometry (drawn once in <defs>, oriented per-edge).
const ARROW = 8;

// Human gloss for every canonical PowerRelation — the legend + fallback voice.
const RELATION_GLOSS: Record<PowerRelation, string> = {
  appoints: "names into office",
  dismisses: "removes from office",
  confirms: "must approve",
  dissolves: "can dissolve",
  vetoes: "can block legislation",
  reviews: "reviews constitutionality",
  elects: "elects / selects",
  confidence: "holds the confidence of",
};

const BRANCH_LABEL: Record<string, string> = {
  executive: "Executive",
  legislative: "Legislative",
  judicial: "Judicial",
  electoral: "Electoral",
  other: "Other",
};

const TIER_LABEL: Record<string, string> = {
  national: "National",
  state: "State",
  local: "Local",
};

/**
 * PowerFlow — the government-structure power-flow diagram. Institutions are laid
 * out in branch COLUMNS × tier ROWS; directed authority edges are relation-
 * preserving curved arrows. All geometry comes from the pure, unit-tested
 * `layoutPowerFlow`, so this component is a thin renderer.
 *
 * Interaction: hover/focus an institution → the rest dims and its incident edges
 * light in `--accent` (gated by `highlightOnHover`). The SSR / no-JS fallback is
 * a fully structured, semantic account of the whole GovernmentStructure — every
 * institution, fact, edge, source, constitutional basis, and divergence note is
 * present without JS and under reduced-motion.
 */
export default function PowerFlow({ structure, caption, highlightOnHover = true }: PowerFlowProps) {
  const institutions: PowerFlowInstitution[] = structure.institutions.map((i) => ({
    id: i.id,
    name: i.name,
    branch: i.branch,
    tier: i.tier,
  }));
  const layout = layoutPowerFlow(institutions, structure.powerFlow);
  const [active, setActive] = useState<string | null>(null);

  const nameOf = (id: string): string =>
    structure.institutions.find((i) => i.id === id)?.name ?? id;

  const edgeLit = (e: { from: string; to: string }): boolean =>
    active != null && (e.from === active || e.to === active);
  const dimmed = highlightOnHover && active != null;

  // Relations actually present, in canonical POWER_RELATIONS order (legend).
  const relationsPresent: PowerRelation[] = POWER_RELATIONS.filter((r) =>
    structure.powerFlow.some((e) => e.relation === r),
  );

  return (
    <figure className="mdx-figure mdx-figure--wide pf">
      <div className="mdx-panel pf-panel">
        <svg
          className={dimmed ? "pf-svg pf-svg--dimmed" : "pf-svg"}
          viewBox={layout.viewBox}
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label={caption ? `Power-flow diagram: ${caption}` : `Power-flow diagram for ${structure.name}`}
        >
          <defs>
            <marker
              id="pf-arrow"
              markerWidth={ARROW}
              markerHeight={ARROW}
              refX={ARROW - 1}
              refY={ARROW / 2}
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d={`M0,0 L${ARROW},${ARROW / 2} L0,${ARROW} z`} className="pf-arrowhead" />
            </marker>
            <marker
              id="pf-arrow-lit"
              markerWidth={ARROW}
              markerHeight={ARROW}
              refX={ARROW - 1}
              refY={ARROW / 2}
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d={`M0,0 L${ARROW},${ARROW / 2} L0,${ARROW} z`} className="pf-arrowhead pf-arrowhead--lit" />
            </marker>
          </defs>

          {/* ── branch column headers ─────────────────────────────────────────── */}
          <g className="pf-col-labels" aria-hidden="true">
            {layout.columns.map((c) => (
              <text key={`col-${c.branch}`} className="pf-col-label" x={c.x} y={-14} textAnchor="middle">
                {BRANCH_LABEL[c.branch] ?? c.branch}
              </text>
            ))}
          </g>

          {/* ── tier row labels (left gutter) ─────────────────────────────────── */}
          <g className="pf-row-labels" aria-hidden="true">
            {layout.rows.map((r) => {
              const leftX = layout.columns.length > 0 ? layout.columns[0]!.left - 14 : -14;
              return (
                <text
                  key={`row-${r.tier}`}
                  className="pf-row-label"
                  x={leftX}
                  y={r.y}
                  textAnchor="end"
                  dominantBaseline="middle"
                >
                  {TIER_LABEL[r.tier] ?? r.tier}
                </text>
              );
            })}
          </g>

          {/* ── edges (drawn first, under the boxes) ──────────────────────────── */}
          <g className="pf-edges">
            {layout.edges.map((e, i) => {
              const lit = edgeLit(e);
              return (
                <g
                  key={`e-${e.from}-${e.to}-${i}`}
                  className={`pf-edge pf-edge--${e.relation}${lit ? " pf-edge--lit" : ""}`}
                  aria-hidden="true"
                >
                  <path
                    className="pf-edge-line"
                    d={e.d}
                    fill="none"
                    markerEnd={`url(#${lit ? "pf-arrow-lit" : "pf-arrow"})`}
                  />
                  <g className="pf-edge-labelwrap">
                    <rect
                      className="pf-edge-labelbg"
                      x={e.labelAt.x - labelHalfW(e.relation)}
                      y={e.labelAt.y - 8}
                      width={labelHalfW(e.relation) * 2}
                      height={16}
                      rx={2}
                    />
                    <text className="pf-edge-label" x={e.labelAt.x} y={e.labelAt.y + 3} textAnchor="middle">
                      {e.relation}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>

          {/* ── institution nodes ─────────────────────────────────────────────── */}
          <g className="pf-nodes">
            {layout.nodes.map((n) => {
              const isActive = active === n.id;
              return (
                <g
                  key={`n-${n.id}`}
                  className={`pf-node pf-node--${n.branch}${isActive ? " pf-node--active" : ""}`}
                  tabIndex={highlightOnHover ? 0 : -1}
                  role={highlightOnHover ? "button" : "img"}
                  aria-label={`${n.lines.join(" ")} — ${BRANCH_LABEL[n.branch] ?? n.branch}, ${TIER_LABEL[n.tier] ?? n.tier}`}
                  onMouseEnter={highlightOnHover ? () => setActive(n.id) : undefined}
                  onMouseLeave={highlightOnHover ? () => setActive((c) => (c === n.id ? null : c)) : undefined}
                  onFocus={highlightOnHover ? () => setActive(n.id) : undefined}
                  onBlur={highlightOnHover ? () => setActive((c) => (c === n.id ? null : c)) : undefined}
                >
                  <rect className="pf-node-box" x={n.x} y={n.y} width={n.width} height={n.height} rx={4} />
                  <text
                    className="pf-node-label"
                    x={n.cx}
                    y={labelTop(n.y, n.height, n.lines.length)}
                    textAnchor="middle"
                  >
                    {n.lines.map((line, li) => (
                      <tspan key={li} x={n.cx} dy={li === 0 ? 0 : 18}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* ── on-canvas relation legend (canonical order) ─────────────────────── */}
        {relationsPresent.length > 0 ? (
          <ul className="pf-legend" aria-label="Power-relation legend">
            {relationsPresent.map((r) => (
              <li key={`lg-${r}`} className={`pf-legend-item pf-legend-item--${r}`}>
                <span className="pf-legend-swatch" aria-hidden="true" />
                <span className="pf-legend-name">{r}</span>
                <span className="pf-legend-gloss">{RELATION_GLOSS[r]}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {/* ── SSR / no-JS structured fallback ─────────────────────────────────── */}
        <PowerFlowFallback structure={structure} nameOf={nameOf} relationsPresent={relationsPresent} />
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}

/**
 * The no-JS structured account of the whole GovernmentStructure. Always present
 * in the DOM (revealed on mobile / when the SVG is unavailable), so the figure is
 * never blank and every fact, source, basis, and divergence note is legible.
 */
function PowerFlowFallback({
  structure,
  nameOf,
  relationsPresent,
}: {
  structure: GovernmentStructure;
  nameOf: (id: string) => string;
  relationsPresent: PowerRelation[];
}) {
  const s = structure;
  // Institutions grouped by branch → tier for the table.
  const rows = [...s.institutions].sort((a, b) =>
    a.branch !== b.branch
      ? a.branch.localeCompare(b.branch)
      : a.tier !== b.tier
        ? a.tier.localeCompare(b.tier)
        : a.id.localeCompare(b.id),
  );

  const fieldDivergences = s.fieldProvenance.filter((fp) => fp.divergence);

  return (
    <div className="pf-fallback">
      <h3 className="pf-fallback-title">{s.name} — government structure</h3>

      {/* ── institution table, grouped by branch / tier ─────────────────────── */}
      <p className="mdx-label">Institutions</p>
      <table className="pf-fallback-table">
        <thead>
          <tr>
            <th scope="col">Institution</th>
            <th scope="col">Branch</th>
            <th scope="col">Tier</th>
            <th scope="col">Kind</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((inst) => (
            <tr key={`ft-${inst.id}`}>
              <th scope="row">{inst.name}</th>
              <td>{BRANCH_LABEL[inst.branch] ?? inst.branch}</td>
              <td>{TIER_LABEL[inst.tier] ?? inst.tier}</td>
              <td>{inst.kind}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── system / executive / chamber / judiciary / federal / election facts ─ */}
      <p className="mdx-label">System</p>
      <ul className="pf-fallback-facts">
        <li>
          <span className="pf-fact-key">System type</span>: {s.systemType.systemType} (archetype{" "}
          {s.systemType.archetypeId})
        </li>
        {s.systemType.classifiers.map((c, i) => (
          <li key={`clf-${i}`}>
            <span className="pf-fact-key">Classifier {c.sourceId}</span>: {c.verdict}
          </li>
        ))}
        <li>
          <span className="pf-fact-key">Completeness</span>: {s.completenessScore}/100
        </li>
      </ul>

      <p className="mdx-label">Executive</p>
      <ul className="pf-fallback-facts">
        <li>
          <span className="pf-fact-key">Head of state</span>: {nameOf(s.executive.headOfState.institutionId)} (
          {s.executive.headOfState.selection})
        </li>
        <li>
          <span className="pf-fact-key">Head of government</span>:{" "}
          {nameOf(s.executive.headOfGovernment.institutionId)} ({s.executive.headOfGovernment.selection})
        </li>
        <li>
          <span className="pf-fact-key">Roles fused</span>: {s.executive.fused ? "yes" : "no"}
        </li>
      </ul>

      {s.chambers.length > 0 ? (
        <>
          <p className="mdx-label">Chambers</p>
          <ul className="pf-fallback-facts">
            {s.chambers.map((ch) => (
              <li key={`ch-${ch.id}`}>
                <span className="pf-fact-key">{ch.name}</span>
                {ch.isLowerHouse === true ? " (lower house)" : ch.isLowerHouse === false ? " (upper house)" : ""} —{" "}
                selection {ch.selection}
                {ch.seats != null ? `, ${ch.seats} seats` : ""}
                {ch.termLengthYears != null ? `, ${ch.termLengthYears}-year term` : ""}
                {ch.electoralSystemFamily ? `, ${ch.electoralSystemFamily}` : ""}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="mdx-label">Judiciary</p>
      <ul className="pf-fallback-facts">
        <li>
          <span className="pf-fact-key">Apex court</span>: {nameOf(s.judiciary.apexCourtId)}
        </li>
        <li>
          <span className="pf-fact-key">Judicial review</span>: {s.judiciary.judicialReview}
        </li>
        <li>
          <span className="pf-fact-key">Appointment</span>: {s.judiciary.appointment}
        </li>
      </ul>

      {s.federalTiers.length > 0 ? (
        <>
          <p className="mdx-label">Federal tiers</p>
          <ul className="pf-fallback-facts">
            {s.federalTiers.map((ft, i) => (
              <li key={`ft2-${i}`}>
                <span className="pf-fact-key">{ft.unitLabel}</span> ({ft.tier})
                {ft.unitCount != null ? `, ${ft.unitCount} units` : ""}
                {ft.selfRuleScore != null ? `, self-rule ${ft.selfRuleScore}/100` : ""}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {s.electionSystems.length > 0 ? (
        <>
          <p className="mdx-label">Election systems</p>
          <ul className="pf-fallback-facts">
            {s.electionSystems.map((es, i) => (
              <li key={`es-${i}`}>
                <span className="pf-fact-key">{es.office}</span>: {es.systemFamily}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {/* ── semantic source → relation → target edge list + basis ───────────── */}
      <p className="mdx-label">Power flow</p>
      <ul className="pf-fallback-edges">
        {s.powerFlow.map((e, i) => (
          <li key={`fe-${i}`}>
            <span className="pf-fallback-from">{nameOf(e.from)}</span>
            <span className="pf-fallback-relation"> {e.relation} </span>
            <span className="pf-fallback-to">{nameOf(e.to)}</span>
            {e.constitutionalBasis ? (
              <span className="pf-fallback-basis">
                {" "}
                — {e.constitutionalBasis.text} ({e.constitutionalBasis.basisOrigin})
                {e.constitutionalBasis.sourceUrl ? (
                  <>
                    {" "}
                    <a href={e.constitutionalBasis.sourceUrl} className="pf-source-link">
                      basis source
                    </a>
                  </>
                ) : null}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {/* ── relation legend ─────────────────────────────────────────────────── */}
      {relationsPresent.length > 0 ? (
        <>
          <p className="mdx-label">Relation legend</p>
          <ul className="pf-fallback-legend">
            {relationsPresent.map((r) => (
              <li key={`fl-${r}`}>
                <span className="pf-fact-key">{r}</span>: {RELATION_GLOSS[r]}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {/* ── provenance / source links (EVERY provenance-bearing group) ──────── */}
      <p className="mdx-label">Sources</p>
      <ul className="pf-fallback-sources">
        <li>
          <span className="pf-fact-key">System type</span>:{" "}
          <a href={s.systemType.provenance.sourceUrl} className="pf-source-link">
            {s.systemType.provenance.sourceId}
          </a>{" "}
          <a href={s.systemType.provenance.methodUrl} className="pf-source-link">
            method
          </a>
        </li>
        <li>
          <span className="pf-fact-key">Head of state</span>:{" "}
          <a href={s.executive.headOfState.provenance.sourceUrl} className="pf-source-link">
            {s.executive.headOfState.provenance.sourceId}
          </a>
        </li>
        <li>
          <span className="pf-fact-key">Head of government</span>:{" "}
          <a href={s.executive.headOfGovernment.provenance.sourceUrl} className="pf-source-link">
            {s.executive.headOfGovernment.provenance.sourceId}
          </a>
        </li>
        {s.chambers.map((ch) => (
          <li key={`src-ch-${ch.id}`}>
            <span className="pf-fact-key">{ch.name}</span>:{" "}
            <a href={ch.provenance.sourceUrl} className="pf-source-link">
              {ch.provenance.sourceId}
            </a>
          </li>
        ))}
        <li>
          <span className="pf-fact-key">Judiciary</span>:{" "}
          <a href={s.judiciary.provenance.sourceUrl} className="pf-source-link">
            {s.judiciary.provenance.sourceId}
          </a>
        </li>
        {s.federalTiers.map((ft, i) => (
          <li key={`src-ft-${i}`}>
            <span className="pf-fact-key">{ft.unitLabel}</span>:{" "}
            <a href={ft.provenance.sourceUrl} className="pf-source-link">
              {ft.provenance.sourceId}
            </a>
          </li>
        ))}
        {s.electionSystems.map((es, i) => (
          <li key={`src-es-${i}`}>
            <span className="pf-fact-key">{es.office} election</span>:{" "}
            <a href={es.provenance.sourceUrl} className="pf-source-link">
              {es.provenance.sourceId}
            </a>
          </li>
        ))}
        {s.institutions.map((inst) => (
          <li key={`src-${inst.id}`}>
            <span className="pf-fact-key">{inst.name}</span>:{" "}
            <a href={inst.provenance.sourceUrl} className="pf-source-link">
              {inst.provenance.sourceId}
            </a>
          </li>
        ))}
        {s.powerFlow.map((e, i) => (
          <li key={`src-pf-${i}`}>
            <span className="pf-fact-key">
              {nameOf(e.from)} {e.relation} {nameOf(e.to)}
            </span>
            :{" "}
            <a href={e.provenance.sourceUrl} className="pf-source-link">
              {e.provenance.sourceId}
            </a>
          </li>
        ))}
      </ul>

      {/* ── divergence notes (system-type AND every field group) ────────────── */}
      {s.systemType.divergence || fieldDivergences.length > 0 ? (
        <>
          <p className="mdx-label">Divergence notes</p>
          <ul className="pf-fallback-divergence">
            {s.systemType.divergence ? (
              <li>
                <span className="pf-fact-key">system-type</span>: {s.systemType.divergence}
              </li>
            ) : null}
            {fieldDivergences.map((fp, i) => (
              <li key={`div-${i}`}>
                <span className="pf-fact-key">{fp.fieldGroup}</span>: {fp.divergence}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

// Approx mono glyph width for the edge-label backing plate.
function labelHalfW(label: string): number {
  return Math.max(10, (label.length * 6.0) / 2 + 5);
}

// Vertical baseline for the first label line so the block is centered in the box.
function labelTop(y: number, h: number, lineCount: number): number {
  const blockH = lineCount * 18;
  return y + (h - blockH) / 2 + 13;
}
