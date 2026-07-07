// ── The Feed "for you" personalization island ──────────────────────────────
//
// SSR renders the feed in QUALITY order (curated.json is pre-ranked) — the
// honest fallback. Personalization is inherently per-device (the taste profile
// only exists in the Worker's behavior store, keyed by localStorage deviceId),
// so it can only happen client-side. On load we fetch this device's /summary,
// derive the live taste profile with the SAME core math the build runs
// (liveProfileFromEvents → aggregateProfile), and — only when the model is
// READY — re-order the bento mosaic + tell the register to re-order too.
//
// The toggle itself is ALWAYS visible (SSR renders it whenever a Worker is
// configured — index.astro gates that at build time) so the affordance is
// honestly discoverable rather than a silently-hidden dead control. Until
// THIS device's model is ready it stays in a "calibrating" state — disabled,
// with a tooltip explaining why (as specific as the /summary response lets us
// be, via the same gateState/gaugeLabel the Bench's live-pill uses) — and
// setCalibrating() is the ONLY thing every no-signal / error path falls back
// to. 0 console errors in every path (the fetch NEVER throws — mirrors
// LiveSignal/Beacon).
//
// Correctness key: personalization is affinity-only. The bento HERO (index 0) is
// a distinct richer FeatureCard that a FeedCard can't become via a DOM move, so
// we keep the hero pinned as the editorial lead and personalize positions 2..N
// (the FeedCard mosaic) among themselves. The register (the long tail) re-orders
// via a khz:foryou CustomEvent it listens for.
import {
  liveProfileFromEvents,
  gaugeLabel,
  gateState,
} from "../components/taste/lib/taste-derive.js";
import type { EngagementEvent, FeedItem, RankProfile } from "@khazana/core";
import { forYouOrder, type PersonalizeItem } from "../lib/for-you.js";
import { assignBento } from "../lib/bento.js";

const DEVICE_KEY = "khazana:deviceId";
const RANKING_KEY = "khz.feed.ranking";

/** The /summary response shape (Worker, public, read-only). Mirrors LiveSignal. */
interface SummaryResponse {
  deviceId: string;
  eventCount: number;
  firstAt: string | null;
  lastAt: string | null;
  spanDays: number;
  ready: boolean;
  gates: { minEvents: number; minDays: number };
  daily: { date: string; weight: number }[];
  events: EngagementEvent[];
}

type Ranking = "for-you" | "top-ranked";

/** Shown whenever we genuinely have no signal to reason about yet (no Worker
 * URL / no deviceId / fetch failed / zero events) — the honest generic case. */
const GENERIC_CALIBRATING_MSG =
  "Building your taste model from your reading — check back after a few more visits.";
/** Title shown once the model is ready and the toggle becomes interactive. */
const READY_TITLE = "Toggle between your personalized order and the top-ranked order";

// Module-scoped stash so a late-initializing register can read the last "for
// you" order even if it missed the event (the event is still the primary path).
declare global {
  interface Window {
    __khzForYouOrder?: string[];
  }
}

function initPersonalize(): void {
  const root = document.querySelector<HTMLElement>("[data-section='bento']");
  const payloadEl = document.querySelector<HTMLScriptElement>("#feed-personalize-data");
  const toggle = document.querySelector<HTMLElement>("[data-rank-toggle]");
  const btn = toggle?.querySelector<HTMLButtonElement>("[data-rank-btn]") ?? null;
  const label = toggle?.querySelector<HTMLElement>("[data-rank-label]") ?? null;
  const glyph = toggle?.querySelector<HTMLElement>("[data-rank-glyph]") ?? null;
  // The SSR toggle only exists when index.astro built it (PUBLIC_WORKER_URL
  // configured); no toggle → nothing for this island to do.
  if (!root || !payloadEl || !btn || !label) return;
  // Double-init guard (this module runs on import AND on every astro:page-load;
  // both fire on first load under View Transitions). Tag the bento root once.
  if (root.dataset.personalizeReady === "1") return;
  root.dataset.personalizeReady = "1";

  /**
   * The ONE state every no-signal / not-ready / error path falls back to: an
   * honest, inert, disabled toggle with a tooltip explaining why — never a
   * silently-hidden control. `message` defaults to the generic case; callers
   * with a live gateState pass the specific "N more events…" sentence.
   */
  function setCalibrating(message: string = GENERIC_CALIBRATING_MSG): void {
    btn!.setAttribute("aria-disabled", "true");
    btn!.setAttribute("aria-pressed", "false");
    btn!.title = message;
    label!.textContent = "calibrating…";
    if (glyph) glyph.textContent = "○";
  }

  /** Flip the toggle from calibrating → interactive once the model is ready. */
  function markReady(): void {
    btn!.removeAttribute("aria-disabled");
    btn!.title = READY_TITLE;
    if (glyph) glyph.textContent = "◈";
  }

  let items: PersonalizeItem[] = [];
  try {
    items = JSON.parse(payloadEl.textContent || "[]") as PersonalizeItem[];
  } catch {
    items = [];
  }
  if (items.length === 0) {
    setCalibrating();
    return;
  }

  const now = new Date().toISOString();

  // ── SSR baseline: capture the quality order for the "top ranked" revert. ──
  // Bento CARDS carry BOTH data-bento and data-item-id (the ↗ source links inside
  // a card also carry data-item-id, so we MUST scope to [data-bento] to select
  // only the card articles). The hero (data-bento="feature") stays pinned; we
  // personalize the FeedCard mosaic (everything after the feature) among itself.
  const bentoNodes = Array.from(root.querySelectorAll<HTMLElement>(":scope > [data-bento]"));
  const mosaicNodes = bentoNodes.filter((n) => n.dataset.bento !== "feature");
  const mosaicSsrOrder = mosaicNodes.map((n) => n.dataset.itemId ?? "");

  // PersonalizeItem already IS a ForYouItem plus `region` — no adapter object
  // needed, just partition by region (forYouOrder only reads the ForYouItem
  // fields it needs; the extra `region` field is harmless).
  const featuredById = new Map<string, PersonalizeItem>();
  const restById = new Map<string, PersonalizeItem>();
  const allById = new Map<string, FeedItem>();
  for (const it of items) {
    if (it.region === "featured") featuredById.set(it.id, it);
    else restById.set(it.id, it);
    // Partial FeedItem carrying topics/entities is enough for aggregateProfile.
    allById.set(it.id, { id: it.id, topics: it.topics, entities: it.entities } as unknown as FeedItem);
  }

  const reduceMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Computed once the profile is ready — the affinity orders for both regions.
  let mosaicForYouOrder: string[] | null = null;
  let restForYouOrder: string[] | null = null;

  /**
   * Reorder the mosaic DOM nodes (only positions after the hero) to `order`, then
   * reassign the positional bento PATTERN sizes so the mosaic stays balanced.
   *
   * SIZE-REASSIGNMENT DECISION: FeedCard's `size` prop drives ONLY `data-bento`,
   * which is a pure CSS grid-span (wide=2col, tall=2row, regular=1×1) — the card
   * renders identical content across sizes (bar a slightly larger title font on
   * wide/tall). So it is safe to reassign positional sizes after a reorder. We run
   * the SAME `assignBento` the SSR used (feature:false, since the hero is excluded)
   * over the reordered mosaic, so position 0 of the mosaic gets PATTERN[0], etc. —
   * keeping the wide/tall/regular rhythm no matter how items were permuted. With
   * `grid-auto-flow: dense` the grid repacks instantly (no animated reshuffle to
   * suppress under prefers-reduced-motion).
   */
  function applyMosaicOrder(order: string[]): void {
    const byId = new Map(mosaicNodes.map((n) => [n.dataset.itemId ?? "", n]));
    const ordered: HTMLElement[] = [];
    const seen = new Set<string>();
    for (const id of order) {
      const node = byId.get(id);
      if (node) {
        ordered.push(node);
        seen.add(id);
      }
    }
    // ids missing from `order` keep their relative position, trailing.
    for (const node of mosaicNodes) {
      if (!seen.has(node.dataset.itemId ?? "")) ordered.push(node);
    }
    const cells = assignBento(ordered, { feature: false });
    for (const cell of cells) {
      cell.item.dataset.bento = cell.size;
      root!.appendChild(cell.item);
    }
  }

  /**
   * Apply the given ranking to both surfaces. `for-you` uses the affinity order;
   * `top-ranked` reverts to the captured SSR order. The register is told via the
   * khz:foryou event (order for "for you", reset:true to revert).
   */
  function applyRanking(mode: Ranking): void {
    if (mode === "for-you" && mosaicForYouOrder && restForYouOrder) {
      applyMosaicOrder(mosaicForYouOrder);
      window.__khzForYouOrder = restForYouOrder;
      document.dispatchEvent(
        new CustomEvent("khz:foryou", { detail: { order: restForYouOrder } }),
      );
    } else {
      applyMosaicOrder(mosaicSsrOrder);
      window.__khzForYouOrder = undefined;
      document.dispatchEvent(new CustomEvent("khz:foryou", { detail: { reset: true } }));
    }
    syncToggle(mode);
  }

  function syncToggle(mode: Ranking): void {
    const forYou = mode === "for-you";
    btn!.setAttribute("aria-pressed", forYou ? "true" : "false");
    label!.textContent = forYou ? "for you" : "top ranked";
  }

  // ── Fetch the device's /summary (never throws — falls back to "calibrating"
  // on any miss, same contract LiveSignal/Beacon follow). ──
  const base = (import.meta.env.PUBLIC_WORKER_URL ?? "").trim();
  let deviceId = "";
  try {
    deviceId = localStorage.getItem(DEVICE_KEY) ?? "";
  } catch {
    deviceId = "";
  }
  if (!base || !deviceId) {
    setCalibrating(); // no URL or no device yet → genuinely nothing to report.
    return;
  }

  const ctrl = new AbortController();
  fetch(`${base.replace(/\/$/, "")}/summary?deviceId=${encodeURIComponent(deviceId)}`, {
    signal: ctrl.signal,
  })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((data: SummaryResponse) => {
      if (!data || typeof data.eventCount !== "number" || data.eventCount === 0) {
        setCalibrating();
        return;
      }

      const profile: RankProfile = liveProfileFromEvents(data.events ?? [], allById, now).profile;
      if (!profile.ready) {
        // Not ready yet, but we DO know how far — surface the exact same
        // gateState/gaugeLabel sentence the Bench's live-pill/fuel-gauges use
        // ("N more events, M more days until the model is ready.").
        const gate = gateState(data.eventCount, data.spanDays, {
          minEvents: data.gates?.minEvents,
          minDays: data.gates?.minDays,
        });
        setCalibrating(gaugeLabel(gate));
        return;
      }

      // Compute the affinity orders for both regions.
      mosaicForYouOrder = forYouOrder([...featuredById.values()], profile);
      restForYouOrder = forYouOrder([...restById.values()], profile);

      // Flip the affordance live and wire the toggle.
      markReady();
      btn!.addEventListener("click", () => {
        const next: Ranking = btn!.getAttribute("aria-pressed") === "true" ? "top-ranked" : "for-you";
        try {
          localStorage.setItem(RANKING_KEY, next);
        } catch {
          /* storage may be unavailable; the toggle still works in-session */
        }
        applyRanking(next);
      });

      // Default when ready = "for you", unless the device chose "top ranked".
      let initial: Ranking = "for-you";
      try {
        if (localStorage.getItem(RANKING_KEY) === "top-ranked") initial = "top-ranked";
      } catch {
        initial = "for-you";
      }
      // reduceMotion note: reorder is a synchronous DOM reflow either way — there
      // is no animated reshuffle to suppress; the CSS grid repacks instantly.
      void reduceMotion;
      applyRanking(initial);
    })
    .catch(() => {
      // failure / abort / parse error → honest calibrating state, never a crash.
      setCalibrating();
    });
}

initPersonalize();
// View Transitions swaps the DOM without a full reload — re-init each nav.
document.addEventListener("astro:page-load", initPersonalize);
