// §4 WHY THIS ITEM — the transparency core. Pick any row from the bench feed;
// get a stacked per-term contribution bar + the assessRank() factor list (label ·
// +contribution · detail · strength dots) + a founder-voice rationale sentence.
// Reacts to the shared store: changing a knob re-synthesizes the basis (segments
// grow/shrink, sentence cross-fades) because contributions are weight × subscore.
// All scoring goes through the PURE assessRank (→ core), never reimplemented here.
import { useMemo } from "react";
import { assessRank, type RankFactor } from "./lib/assess-rank.js";
import { useBenchData } from "./lib/use-bench-data.js";
import { useBenchStore } from "./lib/use-bench-store.js";
import styles from "./WhyThisItem.module.css";

// A fixed hue per term: affinity = clay (your taste/heat); read-time/content =
// amber (the machine); trust = sage; recency = slate; metrics/cluster = muted.
const TERM_COLOR: Record<string, string> = {
  affinity: "var(--editorial)",
  "read-time": "var(--accent)",
  content: "var(--accent-dim)",
  trust: "var(--good)",
  recency: "var(--info)",
  metrics: "#9a7bb0", // GROUP_COLORS.data violet
  cluster: "var(--ink-dim)",
};

const STRENGTH_DOTS: Record<RankFactor["strength"], string> = {
  strong: "▰▰▰▰▰",
  solid: "▰▰▰··",
  minor: "▰····",
  none: "·····",
};

function termColor(label: string): string {
  return TERM_COLOR[label] ?? "var(--ink-dim)";
}

export default function WhyThisItem() {
  const { candidates: items, profile, clusterSizes, now } = useBenchData();
  const { state } = useBenchStore();

  const byId = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);
  const selected = state.selectedId ? byId.get(state.selectedId) : undefined;
  const item = selected ?? items[0];

  const basis = useMemo(() => {
    if (!item) return null;
    const clusterSize = item.clusterId ? clusterSizes[item.clusterId] ?? 1 : 1;
    return assessRank(item, {
      weights: state.weights,
      gaussian: state.gaussian,
      profile,
      now,
      clusterSize,
      halfLifeDays: state.halfLifeDays,
    });
  }, [item, state.weights, state.gaussian, state.halfLifeDays, profile, now, clusterSizes]);

  if (!item || !basis) {
    return <p className={styles.empty}>no item selected — pick a row in the bench feed above.</p>;
  }

  const positive = basis.factors.filter((f) => f.contribution > 0);

  return (
    <div className={styles.why}>
      <div className={styles.head}>
        <span className={styles.marker} aria-hidden="true">
          ▸
        </span>
        <span className={styles.itemTitle}>{item.title}</span>
        <span className={styles.tier}>
          {basis.tier} · score <span className={styles.score}>{basis.score.toFixed(1)}</span>
        </span>
      </div>

      {/* stacked contribution bar — one segment per positive term, width = share */}
      <div className={styles.stack} role="img" aria-label="Per-term score contributions">
        {positive.map((f) => (
          <span
            key={f.label}
            className={styles.seg}
            style={{ width: `${Math.max(f.share * 100, 0)}%`, background: termColor(f.label) }}
            title={`${f.label}: +${f.contribution.toFixed(2)} (${Math.round(f.share * 100)}%)`}
          />
        ))}
      </div>
      <div className={styles.legend}>
        {positive.slice(0, 4).map((f) => (
          <span key={f.label} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: termColor(f.label) }} />
            {f.label}
          </span>
        ))}
      </div>

      {/* the founder-voice rationale (Newsreader, cross-fades on change) */}
      <p key={basis.rationale} className={styles.rationale}>
        {basis.rationale}
      </p>

      {/* the factor list — assessTrust idiom: label · +contribution · detail · dots */}
      <ul className={styles.factors}>
        {basis.factors.map((f) => (
          <li
            key={f.label}
            className={`${styles.factor} ${f.strength === "none" ? styles.factorMuted : ""}`}
          >
            <span className={styles.fLabel} style={{ color: termColor(f.label) }}>
              {f.label}
            </span>
            <span className={styles.fContribution}>
              {f.contribution > 0 ? "+" : ""}
              {f.contribution.toFixed(2)}
            </span>
            <span className={styles.fDetail}>{f.detail}</span>
            <span
              className={`${styles.fDots} ${styles[`s_${f.strength}`]}`}
              aria-label={`strength ${f.strength}`}
            >
              {STRENGTH_DOTS[f.strength]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
