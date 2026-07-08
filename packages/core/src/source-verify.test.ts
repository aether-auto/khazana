import { expect, test } from "vitest";
import type { SourceEntry } from "./registry.js";
import {
  DISABLE_THRESHOLD,
  REPROBE_AFTER_MS,
  applyFetchResult,
  isReprobeEligible,
  reconcileRegistry,
  type FetchOutcome,
} from "./source-verify.js";

const NOW = "2026-06-30T00:00:00.000Z";
const EARLIER = "2026-06-01T00:00:00.000Z";

const src = (over: Partial<SourceEntry>): SourceEntry => ({
  id: "s",
  type: "rss",
  url: "https://e.com/feed",
  channels: ["tech"],
  enabled: true,
  trustScore: 0.6,
  addedBy: "seed",
  failureCount: 0,
  ...over,
});

const ok = (over: Partial<FetchOutcome> = {}): FetchOutcome => ({
  sourceId: "s",
  ok: true,
  errorKind: "ok",
  itemCount: 5,
  ...over,
});
const permanent = (over: Partial<FetchOutcome> = {}): FetchOutcome => ({
  sourceId: "s",
  ok: false,
  errorKind: "http-4xx",
  httpStatus: 404,
  itemCount: 0,
  ...over,
});
const transient = (over: Partial<FetchOutcome> = {}): FetchOutcome => ({
  sourceId: "s",
  ok: false,
  errorKind: "http-5xx",
  httpStatus: 503,
  itemCount: 0,
  ...over,
});

// ── Success ──────────────────────────────────────────────────────────────────

test("success resets strikes, clears lastError, sets lastOkAt, status active", () => {
  const before = src({ consecutiveFailures: 2, status: "failing", lastError: { kind: "permanent", code: 404, at: EARLIER } });
  const after = applyFetchResult(before, ok(), { now: NOW });
  expect(after.consecutiveFailures).toBe(0);
  expect(after.lastError).toBeUndefined();
  expect(after.lastOkAt).toBe(NOW);
  expect(after.lastFetchedAt).toBe(NOW);
  expect(after.status).toBe("active");
  expect(after.enabled).toBe(true);
});

test("success with zero items marks the source dormant (not active)", () => {
  const after = applyFetchResult(src({}), ok({ itemCount: 0 }), { now: NOW });
  expect(after.status).toBe("dormant");
  expect(after.consecutiveFailures).toBe(0);
});

// ── Transient ────────────────────────────────────────────────────────────────

test("transient failure does NOT increment strikes and never disables", () => {
  const before = src({ consecutiveFailures: 2, status: "active" });
  const after = applyFetchResult(before, transient(), { now: NOW });
  expect(after.consecutiveFailures).toBe(2); // unchanged
  expect(after.status).toBe("failing");
  expect(after.enabled).toBe(true);
  expect(after.lastError).toEqual({ kind: "transient", code: 503, at: NOW });
  expect(after.lastFetchedAt).toBe(NOW);
  expect(after.lastOkAt).toBeUndefined();
});

test("a storm of transient failures never disables a live source", () => {
  let entry = src({ consecutiveFailures: 0 });
  for (let i = 0; i < 10; i++) entry = applyFetchResult(entry, transient(), { now: NOW });
  expect(entry.consecutiveFailures).toBe(0);
  expect(entry.enabled).toBe(true);
  expect(entry.status).toBe("failing");
});

// ── Permanent ────────────────────────────────────────────────────────────────

test("permanent failure increments strikes and records permanent lastError", () => {
  const after = applyFetchResult(src({ consecutiveFailures: 1 }), permanent(), { now: NOW });
  expect(after.consecutiveFailures).toBe(2);
  expect(after.status).toBe("failing");
  expect(after.lastError).toEqual({ kind: "permanent", code: 404, at: NOW });
});

test("legacy entry (no consecutiveFailures) treats absent as 0 then increments to 1", () => {
  const after = applyFetchResult(src({ consecutiveFailures: undefined }), permanent(), { now: NOW });
  expect(after.consecutiveFailures).toBe(1);
  expect(after.status).toBe("failing");
  expect(after.enabled).toBe(true);
});

test("N permanent strikes reaching the threshold disables the source", () => {
  const after = applyFetchResult(src({ consecutiveFailures: DISABLE_THRESHOLD - 1 }), permanent(), { now: NOW });
  expect(after.consecutiveFailures).toBe(DISABLE_THRESHOLD);
  expect(after.status).toBe("disabled");
  expect(after.enabled).toBe(false);
});

test("DISABLE_THRESHOLD is a sane small default (permanent strikes)", () => {
  expect(DISABLE_THRESHOLD).toBe(3);
});

test("worked example: a 404 source struck to threshold → disabled", () => {
  let entry = src({ id: "gone", consecutiveFailures: 0 });
  for (let i = 0; i < DISABLE_THRESHOLD; i++) {
    entry = applyFetchResult(entry, permanent({ sourceId: "gone" }), { now: NOW });
  }
  expect(entry.enabled).toBe(false);
  expect(entry.status).toBe("disabled");
});

// ── shouldAttemptRediscovery decision (pure) ─────────────────────────────────

test("permanent failure at the disable threshold requests rediscovery before disabling", () => {
  const decided = applyFetchResult(src({ consecutiveFailures: DISABLE_THRESHOLD - 1 }), permanent(), { now: NOW });
  expect(decided.shouldAttemptRediscovery).toBe(true);
});

test("transient failure never requests rediscovery", () => {
  const decided = applyFetchResult(src({}), transient(), { now: NOW });
  expect(decided.shouldAttemptRediscovery).toBeUndefined();
});

test("success never requests rediscovery", () => {
  const decided = applyFetchResult(src({}), ok(), { now: NOW });
  expect(decided.shouldAttemptRediscovery).toBeUndefined();
});

// ── reconcileRegistry (batch) ────────────────────────────────────────────────

test("reconcileRegistry applies results by sourceId and leaves unmatched entries untouched", () => {
  const registry = {
    version: 1,
    sources: [
      src({ id: "a", consecutiveFailures: 0 }),
      src({ id: "b", consecutiveFailures: DISABLE_THRESHOLD - 1 }),
      src({ id: "untouched", consecutiveFailures: 0 }),
    ],
  };
  const results: FetchOutcome[] = [
    ok({ sourceId: "a", itemCount: 3 }),
    permanent({ sourceId: "b" }),
  ];
  const { registry: next, actions } = reconcileRegistry(registry, results, { now: NOW });

  const a = next.sources.find((s) => s.id === "a")!;
  const b = next.sources.find((s) => s.id === "b")!;
  const u = next.sources.find((s) => s.id === "untouched")!;

  expect(a.status).toBe("active");
  expect(b.status).toBe("disabled");
  expect(b.enabled).toBe(false);
  expect(u).toEqual(src({ id: "untouched", consecutiveFailures: 0 })); // no result → unchanged
  expect(actions.find((x) => x.id === "b")?.action).toBe("disable");
});

test("reconcileRegistry does not mutate the input registry", () => {
  const registry = { version: 1, sources: [src({ id: "b", consecutiveFailures: DISABLE_THRESHOLD - 1 })] };
  reconcileRegistry(registry, [permanent({ sourceId: "b" })], { now: NOW });
  expect(registry.sources[0]!.enabled).toBe(true);
  expect(registry.sources[0]!.status).toBeUndefined();
});

test("reconcileRegistry recovery resets a previously-failing source", () => {
  const registry = { version: 1, sources: [src({ id: "r", consecutiveFailures: 2, status: "failing" })] };
  const { registry: next } = reconcileRegistry(registry, [ok({ sourceId: "r" })], { now: NOW });
  const r = next.sources[0]!;
  expect(r.consecutiveFailures).toBe(0);
  expect(r.status).toBe("active");
  expect(r.lastError).toBeUndefined();
});

// ── Bounded self-healing re-probe ─────────────────────────────────────────

test("REPROBE_AFTER_MS is a sane default (7 days)", () => {
  expect(REPROBE_AFTER_MS).toBe(7 * 24 * 60 * 60 * 1000);
});

test("crossing the disable threshold stamps disabledAt (so the reprobe window has a start)", () => {
  const after = applyFetchResult(src({ consecutiveFailures: DISABLE_THRESHOLD - 1 }), permanent(), { now: NOW });
  expect(after.status).toBe("disabled");
  expect(after.disabledAt).toBe(NOW);
});

// ── isReprobeEligible (pure predicate) ────────────────────────────────────

test("a live (enabled) source is never reprobe-eligible", () => {
  const live = src({ enabled: true, status: "active" });
  expect(isReprobeEligible(live, NOW)).toBe(false);
});

test("a manually/scout disabled source (enabled:false, no disabled status) is never reprobe-eligible", () => {
  const manuallyOff = src({ enabled: false, status: undefined });
  expect(isReprobeEligible(manuallyOff, NOW)).toBe(false);
});

test("a just-disabled source is NOT reprobe-eligible before the window elapses", () => {
  const justDisabled = src({ enabled: false, status: "disabled", disabledAt: NOW });
  const stillInsideWindow = new Date(Date.parse(NOW) + REPROBE_AFTER_MS - 1000).toISOString();
  expect(isReprobeEligible(justDisabled, stillInsideWindow)).toBe(false);
});

test("a disabled source becomes reprobe-eligible once the window elapses", () => {
  const disabled = src({ enabled: false, status: "disabled", disabledAt: NOW });
  const afterWindow = new Date(Date.parse(NOW) + REPROBE_AFTER_MS).toISOString();
  expect(isReprobeEligible(disabled, afterWindow)).toBe(true);
});

test("a legacy disabled source with no disabledAt is immediately reprobe-eligible", () => {
  // The 208 youtube sources killed by the videos.xml discovery outage were
  // disabled before this field existed. They must self-heal on the very next
  // run once the endpoint recovers, without a manual registry edit.
  const legacy = src({ enabled: false, status: "disabled", disabledAt: undefined });
  expect(isReprobeEligible(legacy, NOW)).toBe(true);
});

// ── applyFetchResult: re-probing a disabled source ────────────────────────

test("re-probe SUCCESS re-enables the source and clears disable state", () => {
  const disabled = src({
    enabled: false,
    status: "disabled",
    consecutiveFailures: DISABLE_THRESHOLD,
    disabledAt: EARLIER,
    lastError: { kind: "permanent", code: 404, at: EARLIER },
  });
  const after = applyFetchResult(disabled, ok({ itemCount: 5 }), { now: NOW });
  expect(after.enabled).toBe(true);
  expect(after.status).toBe("active");
  expect(after.consecutiveFailures).toBe(0);
  expect(after.disabledAt).toBeUndefined();
  expect(after.lastError).toBeUndefined();
  expect(after.lastOkAt).toBe(NOW);
});

test("re-probe SUCCESS with zero items marks the source dormant, still re-enabled", () => {
  const disabled = src({ enabled: false, status: "disabled", consecutiveFailures: DISABLE_THRESHOLD, disabledAt: EARLIER });
  const after = applyFetchResult(disabled, ok({ itemCount: 0 }), { now: NOW });
  expect(after.enabled).toBe(true);
  expect(after.status).toBe("dormant");
});

test("re-probe FAILURE (permanent — still 404) pushes the window out; never re-disables via a fresh strike count", () => {
  const disabled = src({
    enabled: false,
    status: "disabled",
    consecutiveFailures: DISABLE_THRESHOLD,
    disabledAt: EARLIER,
  });
  const after = applyFetchResult(disabled, permanent(), { now: NOW });
  expect(after.enabled).toBe(false);
  expect(after.status).toBe("disabled");
  expect(after.disabledAt).toBe(NOW); // window restarted from this probe
  expect(after.lastError).toEqual({ kind: "permanent", code: 404, at: NOW });
});

test("re-probe FAILURE (transient — e.g. a 503 during the probe) ALSO pushes the window out, never leaves the source in an un-reprobable limbo", () => {
  const disabled = src({
    enabled: false,
    status: "disabled",
    consecutiveFailures: DISABLE_THRESHOLD,
    disabledAt: EARLIER,
  });
  const after = applyFetchResult(disabled, transient(), { now: NOW });
  // Must stay status:"disabled" (not "failing") or isReprobeEligible's
  // `status !== "disabled"` gate would permanently exclude it from ever being
  // reprobed again — a silent, permanent death via a different code path.
  expect(after.enabled).toBe(false);
  expect(after.status).toBe("disabled");
  expect(after.disabledAt).toBe(NOW);
  expect(isReprobeEligible(after, new Date(Date.parse(NOW) + REPROBE_AFTER_MS).toISOString())).toBe(true);
});

test("a bounded re-probe never hammers more than once per window: immediately after a failed probe, the source is not yet eligible again", () => {
  const disabled = src({ enabled: false, status: "disabled", consecutiveFailures: DISABLE_THRESHOLD, disabledAt: EARLIER });
  const after = applyFetchResult(disabled, permanent(), { now: NOW });
  expect(isReprobeEligible(after, NOW)).toBe(false); // window just restarted
});

// ── Schema backward-compatibility ─────────────────────────────────────────

test("legacy entry with no disabledAt parses (backward-compatible schema)", () => {
  const legacy = src({ status: "disabled", enabled: false, consecutiveFailures: DISABLE_THRESHOLD });
  expect((legacy as { disabledAt?: string }).disabledAt).toBeUndefined();
  // applyFetchResult must not throw / must treat it exactly like an entry
  // whose disabledAt was explicitly stamped, once reduced.
  expect(() => applyFetchResult(legacy, ok(), { now: NOW })).not.toThrow();
});
