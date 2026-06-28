import { describe, expect, test, vi } from "vitest";
import { RANK_WEIGHTS, GAUSSIAN_DEFAULTS, MIN_READ_MINUTES } from "@khazana/core";
import { createBenchStore, defaultState } from "./bench-store.js";

describe("bench-store", () => {
  test("defaultState mirrors the core factory constants", () => {
    const d = defaultState();
    expect(d.weights).toEqual(RANK_WEIGHTS);
    expect(d.gaussian).toEqual(GAUSSIAN_DEFAULTS);
    expect(d.gates.minReadMinutes).toBe(MIN_READ_MINUTES);
    expect(d.gates.featuredOn).toBe(false);
    expect(d.filters.format).toBe("all");
    expect(d.selectedId).toBeNull();
  });

  test("setWeight patches one weight and notifies subscribers", () => {
    const store = createBenchStore();
    const seen: number[] = [];
    const unsub = store.subscribe((s) => seen.push(s.weights.affinity));
    store.setWeight("affinity", 0);
    expect(store.get().weights.affinity).toBe(0);
    // other weights untouched
    expect(store.get().weights.readTime).toBe(RANK_WEIGHTS.readTime);
    expect(seen).toEqual([0]);
    unsub();
    store.setWeight("affinity", 5);
    // no longer subscribed → not pushed
    expect(seen).toEqual([0]);
  });

  test("setGaussian / setGates / setFilters merge partials", () => {
    const store = createBenchStore();
    store.setGaussian({ peakMin: 20 });
    expect(store.get().gaussian.peakMin).toBe(20);
    expect(store.get().gaussian.sigmaMin).toBe(GAUSSIAN_DEFAULTS.sigmaMin);
    store.setGates({ featuredOn: true });
    expect(store.get().gates.featuredOn).toBe(true);
    expect(store.get().gates.minReadMinutes).toBe(MIN_READ_MINUTES);
    store.setFilters({ channels: ["ai"] });
    expect(store.get().filters.channels).toEqual(["ai"]);
  });

  test("reset returns every knob to factory but keeps the selection", () => {
    const store = createBenchStore();
    store.setSelected("abc");
    store.setWeight("affinity", 0);
    store.setGaussian({ peakMin: 30 });
    store.setGates({ diversityOn: true });
    store.setHalfLife(14);
    store.reset();
    expect(store.get().weights).toEqual(RANK_WEIGHTS);
    expect(store.get().gaussian).toEqual(GAUSSIAN_DEFAULTS);
    expect(store.get().gates.diversityOn).toBe(false);
    expect(store.get().halfLifeDays).toBe(7);
    expect(store.get().selectedId).toBe("abc"); // selection preserved
  });

  test("subscribe fires on every set; unsubscribe stops it", () => {
    const store = createBenchStore();
    const fn = vi.fn();
    const unsub = store.subscribe(fn);
    store.setSelected("x");
    store.setHalfLife(10);
    expect(fn).toHaveBeenCalledTimes(2);
    unsub();
    store.setSelected("y");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
