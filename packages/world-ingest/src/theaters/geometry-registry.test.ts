import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import {
  activeGeometryProviderIds,
  isGeometrySourceEnabled,
} from "./geometry-registry.js";
import { getActiveControlGeometrySources } from "./index.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tracker(requests: readonly { readonly provider: string; readonly status: string }[]): string {
  const dir = mkdtempSync(join(tmpdir(), "khazana-geometry-permission-"));
  dirs.push(dir);
  const path = join(dir, "theater-geometry.json");
  writeFileSync(path, JSON.stringify({ requests }));
  return path;
}

test("checked-in pending tracker leaves both licensed providers disabled and out of the active list", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");

  expect(isGeometrySourceEnabled("deepstatemap")).toBe(false);
  expect(isGeometrySourceEnabled("isw-ctp")).toBe(false);
  expect(activeGeometryProviderIds()).toEqual(["wikipedia"]);
  expect(getActiveControlGeometrySources().map((source) => source.providerId)).toEqual(["wikipedia"]);
  expect(fetchSpy).not.toHaveBeenCalled();

  fetchSpy.mockRestore();
});

test("a test-local granted status enables only its mapped provider without editing the checked-in tracker", () => {
  const trackerPath = tracker([
    { provider: "DeepStateMap", status: "granted" },
    { provider: "ISW/CTP", status: "pending" },
  ]);

  expect(isGeometrySourceEnabled("deepstatemap", { trackerPath })).toBe(true);
  expect(isGeometrySourceEnabled("isw-ctp", { trackerPath })).toBe(false);
  expect(activeGeometryProviderIds({ trackerPath })).toEqual(["wikipedia", "deepstatemap"]);
  expect(getActiveControlGeometrySources({ trackerPath }).map((source) => source.providerId)).toEqual([
    "wikipedia",
    "deepstatemap",
  ]);
});

test("malformed and unknown permission tracker data fails closed", () => {
  const malformedPath = tracker([{ provider: "DeepStateMap", status: "GRANTED" }]);
  const unknownPath = tracker([{ provider: "Unrelated provider", status: "granted" }]);

  expect(isGeometrySourceEnabled("deepstatemap", { trackerPath: malformedPath })).toBe(false);
  expect(isGeometrySourceEnabled("deepstatemap", { trackerPath: unknownPath })).toBe(false);
});
