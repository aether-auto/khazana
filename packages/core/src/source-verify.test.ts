import { expect, test } from "vitest";
import type { Registry, SourceEntry } from "./registry.js";
import type { SourceHealthFile } from "./registry.js";
import {
  DISABLE_THRESHOLD,
  REPROBE_AFTER_MS,
  applyFetchResult,
  extractSourceHealth,
  isReprobeEligible,
  mergeSourceHealth,
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

test("a source disabled with an explicit non-'disabled' status (e.g. a human flipped enabled:false on a previously-active source) is never reprobe-eligible", () => {
  const manuallyOff = src({ enabled: false, status: "active" });
  expect(isReprobeEligible(manuallyOff, NOW)).toBe(false);
});

test("a legacy entry disabled with NO status field at all (status undefined) is immediately reprobe-eligible — status absent is indistinguishable from our own pre-`status`-field auto-disable path (the ~208 youtube sources), so it defaults to self-healing rather than being stuck forever", () => {
  const legacyNoStatus = src({ enabled: false, status: undefined, disabledAt: undefined });
  expect(isReprobeEligible(legacyNoStatus, NOW)).toBe(true);
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

// ── applyFetchResult must route legacy absent-status disabled entries through
// the SAME "disabled entry" branch as isReprobeEligible treats them, or a
// successful reprobe would leave `enabled:false` (the live-branch success case
// never touches `enabled`) while flipping `status` away from "disabled" —
// orphaning the source forever (isReprobeEligible would then see a defined,
// non-"disabled" status and never offer it again). ─────────────────────────

test("re-probe SUCCESS on a legacy absent-status disabled entry fully re-enables it (does not orphan it with enabled:false + status:active)", () => {
  const legacyDisabled = src({ enabled: false, status: undefined, disabledAt: undefined, failureCount: 0 });
  const after = applyFetchResult(legacyDisabled, ok({ itemCount: 5 }), { now: NOW });
  expect(after.enabled).toBe(true);
  expect(after.status).toBe("active");
  expect(after.consecutiveFailures).toBe(0);
});

test("re-probe FAILURE on a legacy absent-status disabled entry stays disabled (status stamped) and restarts the window, rather than free-striking from 0", () => {
  const legacyDisabled = src({ enabled: false, status: undefined, disabledAt: undefined, failureCount: 0 });
  const after = applyFetchResult(legacyDisabled, permanent(), { now: NOW });
  expect(after.enabled).toBe(false);
  expect(after.status).toBe("disabled");
  expect(after.disabledAt).toBe(NOW);
  // Still findable by isReprobeEligible next window — not orphaned.
  expect(isReprobeEligible(after, new Date(Date.parse(NOW) + REPROBE_AFTER_MS).toISOString())).toBe(true);
});

// ── Schema backward-compatibility ─────────────────────────────────────────

test("legacy entry with no disabledAt parses (backward-compatible schema)", () => {
  const legacy = src({ status: "disabled", enabled: false, consecutiveFailures: DISABLE_THRESHOLD });
  expect((legacy as { disabledAt?: string }).disabledAt).toBeUndefined();
  // applyFetchResult must not throw / must treat it exactly like an entry
  // whose disabledAt was explicitly stamped, once reduced.
  expect(() => applyFetchResult(legacy, ok(), { now: NOW })).not.toThrow();
});

// ── extractSourceHealth / mergeSourceHealth: committed cross-clone persistence ──
// (see SourceHealthFile in registry.ts for the "why" — data/sources.json is
// gitignored and never survives a fresh CI checkout, so this small committed
// subset is how status/consecutiveFailures/disabledAt persist across runs.)

test("extractSourceHealth omits a pristine source with no recorded health signal", () => {
  const registry: Registry = { version: 1, sources: [src({ id: "fresh" })] };
  const health = extractSourceHealth(registry);
  expect(health.sources).toEqual([]);
});

test("extractSourceHealth includes only the health subset for a source with a signal, not url/type/channels", () => {
  const registry: Registry = {
    version: 1,
    sources: [
      src({
        id: "gone",
        enabled: false,
        status: "disabled",
        consecutiveFailures: DISABLE_THRESHOLD,
        disabledAt: NOW,
        lastError: { kind: "permanent", code: 404, at: NOW },
      }),
    ],
  };
  const health = extractSourceHealth(registry);
  expect(health.sources).toHaveLength(1);
  const h = health.sources[0]!;
  expect(h).toEqual({
    id: "gone",
    enabled: false,
    status: "disabled",
    consecutiveFailures: DISABLE_THRESHOLD,
    disabledAt: NOW,
    lastError: { kind: "permanent", code: 404, at: NOW },
  });
  // url/type/channels/trustScore must NOT leak into the committed health file.
  expect((h as Record<string, unknown>)["url"]).toBeUndefined();
  expect((h as Record<string, unknown>)["type"]).toBeUndefined();
});

test("extractSourceHealth includes a source whose only signal is a nonzero failureCount", () => {
  const registry: Registry = { version: 1, sources: [src({ id: "flaky", failureCount: 2 })] };
  const health = extractSourceHealth(registry);
  expect(health.sources).toEqual([{ id: "flaky", failureCount: 2 }]);
});

test("mergeSourceHealth is a no-op when the health file is empty", () => {
  const registry: Registry = { version: 1, sources: [src({ id: "a" })] };
  const merged = mergeSourceHealth(registry, { version: 1, sources: [] });
  expect(merged).toEqual(registry);
});

test("mergeSourceHealth layers matching health onto the base registry by id, leaving unmatched entries untouched", () => {
  const registry: Registry = {
    version: 1,
    sources: [src({ id: "gone", enabled: true, status: undefined }), src({ id: "fine", enabled: true })],
  };
  const health: SourceHealthFile = {
    version: 1,
    sources: [{ id: "gone", enabled: false, status: "disabled", consecutiveFailures: 3, disabledAt: NOW }],
  };
  const merged = mergeSourceHealth(registry, health);
  const gone = merged.sources.find((s) => s.id === "gone")!;
  const fine = merged.sources.find((s) => s.id === "fine")!;
  expect(gone.enabled).toBe(false);
  expect(gone.status).toBe("disabled");
  expect(gone.consecutiveFailures).toBe(3);
  expect(gone.disabledAt).toBe(NOW);
  expect(fine).toEqual(src({ id: "fine", enabled: true })); // untouched
});

test("mergeSourceHealth does not mutate either input", () => {
  const registry: Registry = { version: 1, sources: [src({ id: "gone", enabled: true })] };
  const health: SourceHealthFile = { version: 1, sources: [{ id: "gone", enabled: false, status: "disabled" }] };
  mergeSourceHealth(registry, health);
  expect(registry.sources[0]!.enabled).toBe(true);
  expect(registry.sources[0]!.status).toBeUndefined();
});

test("strikes accumulate across simulated CI runs via the committed health file, disabling a persistently-dead source at DISABLE_THRESHOLD", () => {
  // Reproduces the real production cycle: every CI run starts from a FRESH clone
  // (sources.json gitignored → pristine seed), layers the committed
  // source-health.json onto it (mergeSourceHealth), reconciles this run's fetch
  // outcomes, then re-extracts the health subset to be committed back. A feed
  // that 404s every run must therefore climb 1 → 2 → 3 strikes across three runs
  // and auto-disable — NOT reset to 0 each clone. This is the whole point of the
  // committed health file; if it regressed, no source could ever be pruned.
  const seed = (): Registry => ({ version: 1, sources: [src({ id: "dead", url: "https://dead.example/feed" })] });
  const outcome = permanent({ sourceId: "dead" });

  // Persisted health carried between runs (empty before the first run).
  let health: SourceHealthFile = { version: 1, sources: [] };
  const strikesByRun: number[] = [];
  const disabledByRun: boolean[] = [];

  for (let run = 0; run < 3; run++) {
    const fresh = mergeSourceHealth(seed(), health); // fresh clone + committed health
    const { registry: reconciled } = reconcileRegistry(fresh, [outcome], { now: NOW });
    const entry = reconciled.sources[0]!;
    strikesByRun.push(entry.consecutiveFailures ?? 0);
    disabledByRun.push(entry.enabled === false && entry.status === "disabled");
    health = extractSourceHealth(reconciled); // what pipeline.yml commits back
  }

  expect(strikesByRun).toEqual([1, 2, 3]); // accumulates, does not reset per clone
  expect(disabledByRun).toEqual([false, false, true]); // crosses threshold on run 3
});

test("extractSourceHealth then mergeSourceHealth onto a fresh copy of the same base round-trips the health state", () => {
  const before: Registry = {
    version: 1,
    sources: [src({ id: "gone", enabled: false, status: "disabled", consecutiveFailures: DISABLE_THRESHOLD, disabledAt: NOW })],
  };
  const health = extractSourceHealth(before);
  // Simulate a fresh clone: base registry has the seed's pristine defaults.
  const freshSeed: Registry = { version: 1, sources: [src({ id: "gone" })] };
  const restored = mergeSourceHealth(freshSeed, health);
  expect(restored.sources[0]!.enabled).toBe(false);
  expect(restored.sources[0]!.status).toBe("disabled");
  expect(restored.sources[0]!.consecutiveFailures).toBe(DISABLE_THRESHOLD);
  expect(restored.sources[0]!.disabledAt).toBe(NOW);
});
