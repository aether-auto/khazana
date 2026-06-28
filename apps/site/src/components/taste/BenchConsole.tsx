// §2 THE BENCH — the hero. Eight weight faders (one per ranker constant, in the
// score-sum order so the panel reads like rank.ts), the LIVE RE-RANK feed (top
// ~20, FLIP-animated on every knob change), and the filter strip (read-time floor,
// featured gate, diversity floor, channel chips). Every control writes the shared
// bench store; the feed re-ranks through the PURE `rerank()` (which scores via
// core — parity-exact). Clicking a row sets §4's selection.
import { useEffect, useMemo, useRef } from "react";
import { gsap } from "gsap";
import {
  RANK_WEIGHTS,
  FEATURED_SIZE,
  type RankWeights,
} from "@khazana/core";
import { rerank, defaultRerank, rankDeltas, type RankedItem } from "./lib/rerank.js";
import { useBenchData } from "./lib/use-bench-data.js";
import { useBenchStore } from "./lib/use-bench-store.js";
import { GROUP_COLORS, channelGroup } from "../observatory/lib/build-analytics.js";
import BenchFader from "./BenchFader.jsx";
import styles from "./BenchConsole.module.css";

const FEED_ROWS = 20;

// The eight faders in score-sum order (rank.ts) — label · constant · weight key.
// Range is 0 → 2× default per the spec (affinity 0→12, recency 0→2, …).
const FADERS: { key: keyof RankWeights; label: string; constant: string; star?: boolean }[] = [
  { key: "recency", label: "recency", constant: "W_RECENCY" },
  { key: "trust", label: "trust", constant: "W_TRUST" },
  { key: "metrics", label: "metrics", constant: "W_METRICS" },
  { key: "cluster", label: "cluster", constant: "W_CLUSTER" },
  { key: "affinity", label: "affinity", constant: "W_AFFINITY", star: true },
  { key: "fullText", label: "full-text", constant: "W_FULLTEXT" },
  { key: "media", label: "media", constant: "W_MEDIA" },
  { key: "readTime", label: "read-time", constant: "W_READTIME" },
];

function groupColor(group: string): string {
  return GROUP_COLORS[group] ?? GROUP_COLORS.science!;
}

function deltaChip(delta: number | undefined): { glyph: string; cls: string } {
  if (delta === undefined || delta === 0) return { glyph: "—", cls: "deltaHold" };
  if (delta > 0) return { glyph: `▲${delta}`, cls: "deltaUp" };
  return { glyph: `▼${Math.abs(delta)}`, cls: "deltaDown" };
}

export default function BenchConsole() {
  // The candidate corpus / profile / channels come from the single shared JSON
  // payload (loaded post-hydration to match SSR — see use-bench-data.ts).
  const { candidates: items, profile, channels, now } = useBenchData();
  const { state, store } = useBenchStore();
  const listRef = useRef<HTMLOListElement>(null);
  // FIRST positions for the FLIP, captured before each re-render's paint.
  const prevRects = useRef<Map<string, number>>(new Map());

  // The factory baseline — for the ▲/▼ delta chips. Memoized (profile/items fixed).
  const baseline = useMemo(() => defaultRerank(items, profile, now), [items, profile, now]);

  // The live ranking under the current knobs (pure; scores through core).
  const ranked: RankedItem[] = useMemo(
    () =>
      rerank(items, {
        weights: state.weights,
        gaussian: state.gaussian,
        gates: state.gates,
        filters: state.filters,
        profile,
        now,
        halfLifeDays: state.halfLifeDays,
      }),
    [items, profile, now, state.weights, state.gaussian, state.gates, state.filters, state.halfLifeDays],
  );

  const deltas = useMemo(() => rankDeltas(ranked, baseline), [ranked, baseline]);
  const visible = ranked.slice(0, FEED_ROWS);
  const selectedId = state.selectedId ?? visible[0]?.id ?? null;

  // Default the §4 selection to the current #1 once, so why-this is never blank.
  useEffect(() => {
    if (state.selectedId == null && visible[0]) store.setSelected(visible[0].id);
    // run only on mount-ish; selection then follows clicks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── FLIP: capture FIRST before paint, INVERT+PLAY after. GPU translateY only. ──
  useEffect(() => {
    const ol = listRef.current;
    if (!ol) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rows = Array.from(ol.querySelectorAll<HTMLElement>("[data-row-id]"));
    const next = new Map<string, number>();
    for (const row of rows) next.set(row.dataset.rowId!, row.getBoundingClientRect().top);

    if (!reduce && prevRects.current.size > 0) {
      for (const row of rows) {
        const id = row.dataset.rowId!;
        const prev = prevRects.current.get(id);
        const curr = next.get(id)!;
        if (prev === undefined) continue;
        const dy = prev - curr;
        if (Math.abs(dy) < 1) continue;
        gsap.fromTo(
          row,
          { y: dy },
          { y: 0, duration: 0.34, ease: "power3.out", overwrite: "auto" },
        );
      }
    }
    prevRects.current = next;
  }, [ranked]);

  const onWeight = (key: keyof RankWeights, value: number) => store.setWeight(key, value);

  const toggleChannel = (ch: string) => {
    const has = state.filters.channels.includes(ch);
    store.setFilters({
      channels: has
        ? state.filters.channels.filter((c) => c !== ch)
        : [...state.filters.channels, ch],
    });
  };

  return (
    <div className={styles.bench}>
      {/* ── LEFT: weight console ── */}
      <div className={styles.console}>
        <div className={styles.consoleHead}>
          <span className={styles.consoleTitle}>weight console</span>
          <button
            type="button"
            className={styles.resetAll}
            data-magnetic
            onClick={() => store.reset()}
          >
            ⟲ reset all
          </button>
        </div>
        <div className={styles.faders}>
          {FADERS.map((f) => (
            <BenchFader
              key={f.key}
              label={f.label}
              constantName={f.constant}
              value={state.weights[f.key]}
              min={0}
              max={2 * (RANK_WEIGHTS[f.key] || 1)}
              defaultValue={RANK_WEIGHTS[f.key]}
              step={f.key === "cluster" || f.key === "media" ? 0.05 : 0.1}
              decimals={f.key === "cluster" || f.key === "media" ? 2 : 1}
              starred={f.star}
              onChange={(v) => onWeight(f.key, v)}
            />
          ))}
        </div>
      </div>

      {/* ── RIGHT: live re-rank feed + filter strip ── */}
      <div className={styles.feedCol}>
        <div className={styles.feedHead}>
          <span className={styles.feedTitle}>live re-rank</span>
          <span className={styles.feedMeta}>
            {ranked.length} items · top {Math.min(FEED_ROWS, visible.length)}
          </span>
        </div>

        {visible.length === 0 ? (
          <p className={styles.feedEmpty}>no items pass the current filters — loosen the floor or clear a channel.</p>
        ) : (
          <ol className={styles.feed} ref={listRef}>
            {visible.map((it, i) => {
              const chip = deltaChip(deltas.get(it.id));
              const isFeatureGate =
                state.gates.featuredOn && i === FEATURED_SIZE && visible.length > FEATURED_SIZE;
              const belowGate = state.gates.featuredOn && i < FEATURED_SIZE && it.readMin < 7;
              const promotedMedia = state.gates.diversityOn && it.isMedia;
              return (
                <li
                  key={it.id}
                  data-row-id={it.id}
                  className={isFeatureGate ? styles.gateRow : undefined}
                >
                  <button
                    type="button"
                    className={`${styles.row} ${selectedId === it.id ? styles.rowActive : ""}`}
                    onClick={() => store.setSelected(it.id)}
                    aria-pressed={selectedId === it.id}
                  >
                    <span className={styles.rank}>{String(i + 1).padStart(2, "0")}</span>
                    <span className={`${styles.delta} ${styles[chip.cls]}`}>{chip.glyph}</span>
                    <span className={styles.title}>
                      {it.title}
                      {belowGate && <span className={styles.gateTag}>under 7m</span>}
                      {promotedMedia && <span className={styles.divTag}>promoted</span>}
                    </span>
                    <span className={styles.channel} style={{ color: groupColor(it.group) }}>
                      {it.channel}
                    </span>
                    <span className={styles.readmin}>{it.readMin}m</span>
                    <span className={styles.score}>{it.tasteScore.toFixed(1)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {/* ── filter strip ── */}
        <div className={styles.filters}>
          <div className={styles.filterRow}>
            <BenchFader
              label="read-time floor"
              value={state.gates.minReadMinutes}
              min={0}
              max={20}
              defaultValue={5}
              step={1}
              decimals={0}
              unit="m"
              onChange={(v) => store.setGates({ minReadMinutes: Math.round(v) })}
            />
          </div>
          <div className={styles.toggles}>
            <button
              type="button"
              className={`${styles.toggle} ${state.gates.featuredOn ? styles.toggleOn : ""}`}
              aria-pressed={state.gates.featuredOn}
              onClick={() => store.setGates({ featuredOn: !state.gates.featuredOn })}
            >
              <span className={styles.toggleBox} aria-hidden="true">
                {state.gates.featuredOn ? "☑" : "☐"}
              </span>
              featured gate
              <span className={styles.toggleHint}>≥7m · top {FEATURED_SIZE}</span>
            </button>
            <button
              type="button"
              className={`${styles.toggle} ${state.gates.diversityOn ? styles.toggleOn : ""}`}
              aria-pressed={state.gates.diversityOn}
              onClick={() => store.setGates({ diversityOn: !state.gates.diversityOn })}
            >
              <span className={styles.toggleBox} aria-hidden="true">
                {state.gates.diversityOn ? "☑" : "☐"}
              </span>
              diversity floor
            </button>
          </div>
          {channels.length > 0 && (
            <div className={styles.chips} role="group" aria-label="Filter by channel">
              {channels.map((ch) => {
                const on = state.filters.channels.includes(ch);
                return (
                  <button
                    key={ch}
                    type="button"
                    className={`${styles.chip} ${on ? styles.chipOn : ""}`}
                    aria-pressed={on}
                    style={on ? { color: groupColor(channelGroup(ch)), borderColor: groupColor(channelGroup(ch)) } : undefined}
                    onClick={() => toggleChannel(ch)}
                  >
                    {ch}
                    {on && <span aria-hidden="true"> ✕</span>}
                  </button>
                );
              })}
              {state.filters.channels.length > 0 && (
                <button
                  type="button"
                  className={styles.chipClear}
                  onClick={() => store.setFilters({ channels: [] })}
                >
                  clear
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
