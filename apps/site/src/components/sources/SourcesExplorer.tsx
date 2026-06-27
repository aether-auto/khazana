// SOURCES EXPLORER — the faceted, searchable source explorer island.
//
// The intake manifold made legible: instant search, OR-within / AND-across facet
// chips, a mono sort control, a dense readable result list, and a slide-in
// per-source dossier drawer. Deep-linkable (q / facets / sort / source in the URL
// via replaceState). SSR-safe: all window/document/history access is guarded to
// effects so there is no hydration mismatch, and motion honors prefers-reduced.
//
// Tokens-only aesthetic (terminal × editorial, lines-not-boxes); reuses the global
// `.type-<type>` badge classes from sources.css and keeps its own styles in the
// co-located module.
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  EnrichedSource,
  FacetCount,
  SourceStatus,
  SourcesData,
} from "./lib/build-sources.js";
import styles from "./SourcesExplorer.module.css";

interface Props {
  data: SourcesData;
  base: string;
}

// ── facet group definitions ──────────────────────────────────────────────────
type FacetKey = "type" | "channel" | "status" | "provenance";
const FACET_GROUPS: { key: FacetKey; label: string; collapsible: boolean }[] = [
  { key: "status", label: "status", collapsible: false },
  { key: "type", label: "type", collapsible: true },
  { key: "channel", label: "channel", collapsible: true },
  { key: "provenance", label: "from", collapsible: false },
];
// How many chips to show before a group collapses behind "more".
const COLLAPSE_AT = 6;

// ── sort definitions ─────────────────────────────────────────────────────────
type SortKey = "trust" | "name" | "items" | "failures" | "active";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "trust", label: "trust" },
  { key: "active", label: "active" },
  { key: "items", label: "items" },
  { key: "failures", label: "failing" },
  { key: "name", label: "name" },
];

const STATUS_LABEL: Record<SourceStatus, string> = {
  producing: "producing",
  dormant: "dormant",
  failing: "failing",
  disabled: "disabled",
};
// Statuses that read in clay (the "needs attention" tie to the Scout).
const ATTENTION_STATUS = new Set<SourceStatus>(["failing", "dormant"]);

type Selected = Record<FacetKey, Set<string>>;
const emptySelected = (): Selected => ({
  type: new Set(),
  channel: new Set(),
  status: new Set(),
  provenance: new Set(),
});

// ── URL helpers (read once on mount; written via replaceState) ───────────────
function readUrlState(): {
  q: string;
  selected: Selected;
  sort: SortKey;
  source: string | null;
} {
  const sel = emptySelected();
  let q = "";
  let sort: SortKey = "trust";
  let source: string | null = null;
  if (typeof window !== "undefined") {
    const p = new URLSearchParams(window.location.search);
    q = p.get("q") ?? "";
    const s = p.get("sort");
    if (s && SORTS.some((x) => x.key === s)) sort = s as SortKey;
    source = p.get("source");
    for (const { key } of FACET_GROUPS) {
      const raw = p.get(key);
      if (raw) for (const v of raw.split(",").filter(Boolean)) sel[key].add(v);
    }
  }
  return { q, selected: sel, sort, source };
}

export default function SourcesExplorer({ data, base }: Props) {
  // Start from deterministic defaults so the server-rendered markup and the first
  // client render agree (no hydration mismatch); the URL is read in an effect
  // immediately after mount and applied before paint.
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Selected>(emptySelected);
  const [sort, setSort] = useState<SortKey>("trust");
  const [openId, setOpenId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Gates URL-writing until we've read the incoming URL once (avoids clobbering it).
  const hydrated = useRef(false);

  const searchRef = useRef<HTMLInputElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  // Read deep-link state from the URL once, after mount.
  useEffect(() => {
    const s = readUrlState();
    setQuery(s.q);
    setSelected(s.selected);
    setSort(s.sort);
    setOpenId(s.source);
    hydrated.current = true;
  }, []);

  // The page ships a disabled SSR control-bar scaffold (.src-controls) so the
  // pre-hydration page reads as live; once we own the real controls, retire it so
  // there aren't two search boxes. (We don't edit the page; just hide its scaffold.)
  useEffect(() => {
    const scaffold = document.querySelector<HTMLElement>(".src-controls");
    if (scaffold) scaffold.style.display = "none";
  }, []);

  const byId = useMemo(() => {
    const m = new Map<string, EnrichedSource>();
    for (const s of data.sources) m.set(s.id, s);
    return m;
  }, [data.sources]);

  // Newest lastPublished across all sources — for deterministic relative dates.
  const newestPublished = useMemo(() => {
    let max = "";
    for (const s of data.sources) {
      if (s.lastPublished && s.lastPublished > max) max = s.lastPublished;
    }
    return max || null;
  }, [data.sources]);

  // ── filtering ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const terms = q ? q.split(/\s+/).filter(Boolean) : [];
    return data.sources.filter((s) => {
      // Search: every term must hit some haystack field (AND across terms).
      if (terms.length) {
        const hay = [
          s.id,
          s.host,
          s.type,
          s.addedBy,
          s.notes ?? "",
          ...s.channels,
          ...s.producedChannels,
        ]
          .join(" ")
          .toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      // Facets: OR within a group, AND across groups.
      if (selected.type.size && !selected.type.has(s.type)) return false;
      if (selected.status.size && !selected.status.has(s.status)) return false;
      if (selected.provenance.size && !selected.provenance.has(s.addedBy)) return false;
      if (selected.channel.size) {
        if (!s.channels.some((c) => selected.channel.has(c))) return false;
      }
      return true;
    });
  }, [data.sources, query, selected]);

  // ── sorting ────────────────────────────────────────────────────────────────
  const results = useMemo(() => {
    const arr = filtered.slice();
    const byName = (a: EnrichedSource, b: EnrichedSource) => a.id.localeCompare(b.id);
    switch (sort) {
      case "name":
        arr.sort(byName);
        break;
      case "items":
        arr.sort((a, b) => b.itemCount - a.itemCount || byName(a, b));
        break;
      case "failures":
        arr.sort((a, b) => b.failureCount - a.failureCount || byName(a, b));
        break;
      case "active":
        arr.sort((a, b) => {
          // recently active first; nulls last.
          if (a.lastPublished && b.lastPublished) {
            return a.lastPublished < b.lastPublished ? 1 : a.lastPublished > b.lastPublished ? -1 : byName(a, b);
          }
          if (a.lastPublished) return -1;
          if (b.lastPublished) return 1;
          return byName(a, b);
        });
        break;
      case "trust":
      default:
        arr.sort((a, b) => b.trustScore - a.trustScore || byName(a, b));
        break;
    }
    return arr;
  }, [filtered, sort]);

  const anyFilter =
    query.trim() !== "" || sort !== "trust" || FACET_GROUPS.some(({ key }) => selected[key].size > 0);

  // ── URL sync (replaceState; never spams history) ─────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || !hydrated.current) return;
    const p = new URLSearchParams();
    const q = query.trim();
    if (q) p.set("q", q);
    for (const { key } of FACET_GROUPS) {
      const vals = [...selected[key]];
      if (vals.length) p.set(key, vals.join(","));
    }
    if (sort !== "trust") p.set("sort", sort);
    if (openId) p.set("source", openId);
    const qs = p.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", next);
  }, [query, selected, sort, openId]);

  // ── "/" focuses search (unless typing in a field) ────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement | null)?.isContentEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── facet toggling ──────────────────────────────────────────────────────────
  const toggleFacet = useCallback((key: FacetKey, value: string) => {
    setSelected((prev) => {
      const nextSet = new Set(prev[key]);
      if (nextSet.has(value)) nextSet.delete(value);
      else nextSet.add(value);
      return { ...prev, [key]: nextSet };
    });
  }, []);

  const clearAll = useCallback(() => {
    setQuery("");
    setSelected(emptySelected());
    setSort("trust");
  }, []);

  // Stable so the drawer's open-effect (which depends on onClose) doesn't re-run
  // on every parent render and bounce focus back into the panel.
  const closeDrawer = useCallback(() => setOpenId(null), []);

  const openSource = byId.get(openId ?? "") ?? null;

  return (
    <div className={styles.explorer}>
      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div className={styles.controls}>
        <div className={styles.searchWrap}>
          <span className={styles.searchGlyph} aria-hidden="true">⌕</span>
          <input
            ref={searchRef}
            type="search"
            className={styles.search}
            placeholder="search id, host, channel, type, notes…"
            aria-label="search sources"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className={styles.searchClear}
              aria-label="clear search"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
            >
              ×
            </button>
          )}
          <kbd className={styles.searchKbd} aria-hidden="true">/</kbd>
        </div>

        <div className={styles.sort} role="group" aria-label="sort">
          <span className={styles.sortLabel}>sort</span>
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              className={styles.sortBtn}
              aria-pressed={sort === s.key}
              onClick={() => setSort(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Facet chips ──────────────────────────────────────────────────── */}
      <div className={styles.facets}>
        {FACET_GROUPS.map(({ key, label, collapsible }) => {
          const facets = data.facets[key];
          if (facets.length === 0) return null;
          const isExpanded = expanded[key] ?? false;
          const overflowed = collapsible && facets.length > COLLAPSE_AT;
          const shown = overflowed && !isExpanded ? facets.slice(0, COLLAPSE_AT) : facets;
          return (
            <div key={key} className={styles.facetGroup}>
              <span className={styles.facetLabel}>{label}</span>
              <div className={styles.chipRow}>
                {shown.map((f) => (
                  <FacetChip
                    key={f.value}
                    facetKey={key}
                    facet={f}
                    active={selected[key].has(f.value)}
                    reduced={reducedMotion}
                    onToggle={toggleFacet}
                  />
                ))}
                {overflowed && (
                  <button
                    type="button"
                    className={styles.moreBtn}
                    aria-expanded={isExpanded}
                    onClick={() => setExpanded((p) => ({ ...p, [key]: !isExpanded }))}
                  >
                    {isExpanded ? "less" : `+${facets.length - COLLAPSE_AT} more`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Result meta ──────────────────────────────────────────────────── */}
      <div className={styles.resultMeta}>
        <span className={styles.count}>
          <span className={styles.countNum}>{results.length}</span> of {data.sources.length}
        </span>
        {anyFilter && (
          <button type="button" className={styles.clearBtn} onClick={clearAll}>
            clear filters
          </button>
        )}
      </div>

      {/* ── Results ──────────────────────────────────────────────────────── */}
      {results.length === 0 ? (
        <div className={styles.noResults}>
          <p className={styles.noResultsGlyph} aria-hidden="true">⌀</p>
          <p className={styles.noResultsText}>
            No sources match — loosen the search or facets.
          </p>
          {anyFilter && (
            <button type="button" className={styles.clearBtn} onClick={clearAll}>
              clear filters
            </button>
          )}
        </div>
      ) : (
        <ul className={styles.rows} role="list">
          {results.map((s) => (
            <SourceRow
              key={s.id}
              source={s}
              active={s.id === openId}
              onOpen={() => setOpenId(s.id)}
            />
          ))}
        </ul>
      )}

      {/* ── Drawer ───────────────────────────────────────────────────────── */}
      <SourceDrawer
        source={openSource}
        base={base}
        newestPublished={newestPublished}
        reduced={reducedMotion}
        onClose={closeDrawer}
      />
    </div>
  );
}

// ── prefers-reduced-motion hook (SSR-safe) ───────────────────────────────────
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

// ── Facet chip ───────────────────────────────────────────────────────────────
function FacetChip({
  facetKey,
  facet,
  active,
  reduced,
  onToggle,
}: {
  facetKey: FacetKey;
  facet: FacetCount;
  active: boolean;
  reduced: boolean;
  onToggle: (key: FacetKey, value: string) => void;
}) {
  // Status chips for the "needs attention" states read in clay, not amber.
  const attention = facetKey === "status" && ATTENTION_STATUS.has(facet.value as SourceStatus);
  const cls = [
    styles.chip,
    attention ? styles.chipAttention : "",
    reduced ? styles.noMotion : "",
  ]
    .filter(Boolean)
    .join(" ");
  const label = facetKey === "status" ? STATUS_LABEL[facet.value as SourceStatus] ?? facet.value : facet.value;
  return (
    <button
      type="button"
      className={cls}
      aria-pressed={active}
      onClick={() => onToggle(facetKey, facet.value)}
    >
      {facetKey === "status" && <span className={`${styles.chipDot} ${statusDotClass(facet.value as SourceStatus)}`} aria-hidden="true" />}
      <span className={styles.chipText}>{label}</span>
      <span className={styles.chipCount}>{facet.count}</span>
    </button>
  );
}

function statusDotClass(status: SourceStatus): string {
  switch (status) {
    case "producing":
      return styles.dotProducing;
    case "failing":
      return styles.dotFailing;
    case "disabled":
      return styles.dotDisabled;
    case "dormant":
    default:
      return styles.dotDormant;
  }
}

// ── Result row ───────────────────────────────────────────────────────────────
function SourceRow({
  source: s,
  active,
  onOpen,
}: {
  source: EnrichedSource;
  active: boolean;
  onOpen: () => void;
}) {
  const SHOWN_CHANNELS = 3;
  const extra = s.channels.length - SHOWN_CHANNELS;
  const trustPct = Math.round(s.trustScore * 100);
  return (
    <li>
      <button
        type="button"
        className={`${styles.row} ${active ? styles.rowActive : ""} ${s.status === "disabled" ? styles.rowDisabled : ""}`}
        onClick={onOpen}
        aria-haspopup="dialog"
        aria-label={`open dossier for ${s.id}`}
      >
        <span className={`type-badge type-${s.type} ${styles.rowBadge}`}>{s.type}</span>

        <span className={styles.rowMain}>
          <span className={styles.rowName}>{s.id}</span>
          <span className={styles.rowHost}>{s.host}</span>
        </span>

        <span className={styles.rowChannels}>
          {s.channels.slice(0, SHOWN_CHANNELS).map((c) => (
            <span key={c} className={styles.rowChan}>{c}</span>
          ))}
          {extra > 0 && <span className={styles.rowChanMore}>+{extra}</span>}
        </span>

        <span className={styles.rowStats}>
          {s.itemCount > 0 && (
            <span className={styles.rowItems} title={`${s.itemCount} items contributed`}>
              {s.itemCount}
              <span className={styles.rowItemsUnit}>items</span>
            </span>
          )}
          <span className={styles.rowTrust} title="trust score">
            <span className={styles.trustBar} aria-hidden="true">
              <span className={styles.trustFill} style={{ width: `${trustPct}%` }} />
            </span>
            <span className={styles.trustNum}>{trustPct}</span>
          </span>
        </span>

        <span
          className={`${styles.statusDot} ${statusDotClass(s.status)}`}
          title={s.status}
          aria-label={`status: ${s.status}`}
        />
      </button>
    </li>
  );
}

const FOCUSABLE = 'a[href],button:not([disabled]),input,[tabindex]:not([tabindex="-1"])';

// ── Drawer (per-source dossier) ──────────────────────────────────────────────
function SourceDrawer({
  source: s,
  base,
  newestPublished,
  reduced,
  onClose,
}: {
  source: EnrichedSource | null;
  base: string;
  newestPublished: string | null;
  reduced: boolean;
  onClose: () => void;
}) {
  void base; // recentItems already carry the base-prefixed href.
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const open = s !== null;

  // Capture the trigger to restore focus, focus into the panel on open.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = (document.activeElement as HTMLElement | null) ?? null;
    // focus the panel itself (tabIndex -1) so the dialog is the start of tab order.
    const id = window.requestAnimationFrame(() => panelRef.current?.focus());
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Belt-and-suspenders: catch Escape even in the one-frame window before focus
    // lands inside the panel (the panel's own onKeyDown covers the rest).
    const onWinKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onWinKey);
    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener("keydown", onWinKey);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus();
    };
  }, [open, onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "Tab") {
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      const activeEl = document.activeElement;
      if (e.shiftKey && (activeEl === first || activeEl === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  if (!open || !s) return null;

  const trustPct = Math.round(s.trustScore * 100);
  // Channels the source actually produced that it never declared — the divergence.
  const declared = new Set(s.channels);
  const undeclaredProduced = s.producedChannels.filter((c) => !declared.has(c));

  return (
    <div
      className={`${styles.scrim} ${reduced ? styles.noMotion : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={`${styles.drawer} ${reduced ? styles.noMotion : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        {/* Header */}
        <div className={styles.dHead}>
          <div className={styles.dHeadTop}>
            <span className={`type-badge type-${s.type}`}>{s.type}</span>
            <span className={`${styles.dStatus} ${statusPillClass(s.status)}`}>
              <span className={`${styles.chipDot} ${statusDotClass(s.status)}`} aria-hidden="true" />
              {s.status}
            </span>
            <button type="button" className={styles.dClose} aria-label="close" onClick={onClose}>
              ×
            </button>
          </div>
          <h2 id={titleId} className={styles.dTitle}>{s.id}</h2>
          <a className={styles.dHost} href={s.url} target="_blank" rel="noopener noreferrer">
            {s.host} <span aria-hidden="true">↗</span>
          </a>
        </div>

        <div className={styles.dBody}>
          {/* Registry facts */}
          <section className={styles.dSection}>
            <h3 className={styles.dSectionHead}>registry</h3>
            <dl className={styles.dFacts}>
              <div className={styles.dFact}>
                <dt>trust</dt>
                <dd className={styles.dTrust}>
                  <span className={styles.trustBar} aria-hidden="true">
                    <span className={styles.trustFill} style={{ width: `${trustPct}%` }} />
                  </span>
                  <span className={styles.trustNum}>{trustPct}</span>
                </dd>
              </div>
              <div className={styles.dFact}>
                <dt>from</dt>
                <dd>{s.addedBy}</dd>
              </div>
              <div className={styles.dFact}>
                <dt>state</dt>
                <dd className={s.enabled ? "" : styles.dMuted}>{s.enabled ? "enabled" : "disabled"}</dd>
              </div>
              <div className={styles.dFact}>
                <dt>failures</dt>
                <dd className={s.failureCount > 0 ? styles.dFlag : ""}>
                  {s.failureCount > 0 ? `⚑ ${s.failureCount}` : "0"}
                </dd>
              </div>
            </dl>
            <div className={styles.dChannels}>
              <span className={styles.dInline}>declared</span>
              {s.channels.length ? (
                s.channels.map((c) => <span key={c} className={styles.dChan}>{c}</span>)
              ) : (
                <span className={styles.dEmpty}>—</span>
              )}
            </div>
            {s.notes && <p className={styles.dNotes}>{s.notes}</p>}
          </section>

          {/* Live feed stats */}
          <section className={styles.dSection}>
            <h3 className={styles.dSectionHead}>live feed</h3>
            {s.itemCount > 0 ? (
              <>
                <dl className={styles.dFacts}>
                  <div className={styles.dFact}>
                    <dt>items</dt>
                    <dd className={styles.dStat}>{s.itemCount}</dd>
                  </div>
                  <div className={styles.dFact}>
                    <dt>avg read</dt>
                    <dd className={styles.dStat}>{s.avgReadMin}<span className={styles.dUnit}>min</span></dd>
                  </div>
                  <div className={styles.dFact}>
                    <dt>avg taste</dt>
                    <dd className={styles.dStat}>{s.avgTaste}</dd>
                  </div>
                  <div className={styles.dFact}>
                    <dt>last</dt>
                    <dd>{relativeDate(s.lastPublished, newestPublished)}</dd>
                  </div>
                </dl>
                {s.producedChannels.length > 0 && (
                  <div className={styles.dChannels}>
                    <span className={styles.dInline}>produced</span>
                    {s.producedChannels.map((c) => (
                      <span
                        key={c}
                        className={`${styles.dChan} ${declared.has(c) ? "" : styles.dChanNew}`}
                        title={declared.has(c) ? undefined : "produced but not declared"}
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                {undeclaredProduced.length > 0 && (
                  <p className={styles.dHint}>
                    Tagging into {undeclaredProduced.length} channel{undeclaredProduced.length === 1 ? "" : "s"} it
                    never declared{undeclaredProduced.length <= 3 ? ` (${undeclaredProduced.join(", ")})` : ""}.
                  </p>
                )}
              </>
            ) : (
              <p className={styles.dQuiet}>
                No items in the current local feed yet — an Actions-only source, or below the
                read-time floor.
              </p>
            )}
          </section>

          {/* Recent headlines */}
          {s.recentItems.length > 0 && (
            <section className={styles.dSection}>
              <h3 className={styles.dSectionHead}>recent</h3>
              <ul className={styles.dRecent}>
                {s.recentItems.map((it) => (
                  <li key={it.id}>
                    <a className={styles.dRecentLink} href={it.href}>
                      <span className={styles.dRecentTitle}>{it.title}</span>
                      <span className={styles.dRecentDate}>{shortDate(it.publishedAt)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function statusPillClass(status: SourceStatus): string {
  return ATTENTION_STATUS.has(status) ? styles.dStatusAttention : "";
}

// ── date helpers (deterministic; relative to the newest lastPublished) ───────
function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const DAY_MS = 86_400_000;
function relativeDate(iso: string | null, newest: string | null): string {
  if (!iso) return "—";
  if (!newest) return shortDate(iso);
  const then = new Date(iso).getTime();
  const ref = new Date(newest).getTime();
  if (Number.isNaN(then) || Number.isNaN(ref)) return shortDate(iso);
  const days = Math.round((ref - then) / DAY_MS);
  if (days <= 0) return "latest";
  if (days === 1) return "1d before latest";
  if (days < 14) return `${days}d before latest`;
  if (days < 60) return `${Math.round(days / 7)}w before latest`;
  return shortDate(iso);
}
