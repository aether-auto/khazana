// THE BENCH STORE — one source of truth for the Calibration Bench's knobs.
//
// §2's console, §3's Gaussian, §4's why-this, and §5's half-life knob ALL read and
// write this single module-scope store. A fader move in §2 instantly reshapes §3's
// curve and §4's bar because every island subscribes to the same object. The store
// holds ONLY the tunable state; the candidate corpus + profile are passed to each
// island as props (they don't change). Pure besides the subscriber set — no DOM.
import {
  RANK_WEIGHTS,
  GAUSSIAN_DEFAULTS,
  MIN_READ_MINUTES,
  DEFAULT_HALF_LIFE_DAYS,
  type RankWeights,
  type GaussianParams,
  type FormatName,
} from "@khazana/core";

export interface BenchFilters {
  /** Selected channels (empty = all). */
  channels: string[];
  /** Selected format (or "all"). */
  format: FormatName | "all";
}

export interface BenchGates {
  /** The read-time floor (MIN_READ_MINUTES default); items below drop out. */
  minReadMinutes: number;
  /** Whether the featured-gate divider + ≥7-min annotation is shown. */
  featuredOn: boolean;
  /** Whether the client diversity floor is applied (promotes media). */
  diversityOn: boolean;
}

export interface BenchState {
  weights: RankWeights;
  gaussian: GaussianParams;
  gates: BenchGates;
  filters: BenchFilters;
  /** The half-life (days) for the recency/decay curve. */
  halfLifeDays: number;
  /** The item id selected for §4 "why this item" (null → default to current #1). */
  selectedId: string | null;
}

/** The factory-default bench state (the "⟲ reset" target). */
export function defaultState(): BenchState {
  return {
    weights: { ...RANK_WEIGHTS },
    gaussian: { ...GAUSSIAN_DEFAULTS },
    gates: { minReadMinutes: MIN_READ_MINUTES, featuredOn: false, diversityOn: false },
    filters: { channels: [], format: "all" },
    halfLifeDays: DEFAULT_HALF_LIFE_DAYS,
    selectedId: null,
  };
}

type Listener = (state: BenchState) => void;

export interface BenchStore {
  get(): BenchState;
  set(patch: Partial<BenchState>): void;
  /** Patch a single weight by key. */
  setWeight(key: keyof RankWeights, value: number): void;
  /** Patch the gaussian (peak/sigma). */
  setGaussian(patch: Partial<GaussianParams>): void;
  /** Patch the gates. */
  setGates(patch: Partial<BenchGates>): void;
  /** Patch the filters. */
  setFilters(patch: Partial<BenchFilters>): void;
  setHalfLife(days: number): void;
  setSelected(id: string | null): void;
  /** Snap every knob back to factory defaults (keeps the current selection). */
  reset(): void;
  subscribe(fn: Listener): () => void;
}

/**
 * Create a bench store. One instance is created at module scope (see `benchStore`)
 * so every island on the page shares it; tests can spin up isolated instances.
 */
export function createBenchStore(initial?: Partial<BenchState>): BenchStore {
  let state: BenchState = { ...defaultState(), ...initial };
  const listeners = new Set<Listener>();

  const emit = () => {
    for (const fn of listeners) fn(state);
  };

  const set = (patch: Partial<BenchState>) => {
    state = { ...state, ...patch };
    emit();
  };

  return {
    get: () => state,
    set,
    setWeight(key, value) {
      set({ weights: { ...state.weights, [key]: value } });
    },
    setGaussian(patch) {
      set({ gaussian: { ...state.gaussian, ...patch } });
    },
    setGates(patch) {
      set({ gates: { ...state.gates, ...patch } });
    },
    setFilters(patch) {
      set({ filters: { ...state.filters, ...patch } });
    },
    setHalfLife(days) {
      set({ halfLifeDays: days });
    },
    setSelected(id) {
      set({ selectedId: id });
    },
    reset() {
      const d = defaultState();
      set({
        weights: d.weights,
        gaussian: d.gaussian,
        gates: d.gates,
        filters: d.filters,
        halfLifeDays: d.halfLifeDays,
        // keep selectedId — resetting knobs shouldn't blank the why-this panel
      });
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

/**
 * The single shared store instance. All islands import THIS. It lives at module
 * scope so the console, the Gaussian, the why-this panel, and the decay knob are
 * wired to one state object without prop-drilling or context.
 */
export const benchStore: BenchStore = createBenchStore();
