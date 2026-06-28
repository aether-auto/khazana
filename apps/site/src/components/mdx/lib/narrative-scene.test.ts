// apps/site/src/components/mdx/lib/narrative-scene.test.ts
import { expect, test } from "vitest";
import {
  regionValues,
  panelKind,
  DEFAULT_REGION_WEIGHT,
  type MapPanelSpec,
  type PanelSpec,
} from "./narrative-scene.js";

test("regionValues assigns the default weight to each named region", () => {
  const panel: MapPanelSpec = { kind: "map", regions: ["USA", "GBR", "FRA"] };
  expect(regionValues(panel)).toEqual({
    USA: DEFAULT_REGION_WEIGHT,
    GBR: DEFAULT_REGION_WEIGHT,
    FRA: DEFAULT_REGION_WEIGHT,
  });
});

test("regionValues lets explicit weights override the default", () => {
  const panel: MapPanelSpec = {
    kind: "map",
    regions: ["USA", "GBR"],
    weights: { USA: 0.3 },
  };
  expect(regionValues(panel)).toEqual({ USA: 0.3, GBR: DEFAULT_REGION_WEIGHT });
});

test("regionValues includes weighted regions not in the regions list", () => {
  const panel: MapPanelSpec = { kind: "map", regions: ["USA"], weights: { CAN: 0.5 } };
  expect(regionValues(panel)).toEqual({ USA: DEFAULT_REGION_WEIGHT, CAN: 0.5 });
});

test("regionValues skips empty iso3 strings", () => {
  const panel: MapPanelSpec = { kind: "map", regions: ["", "USA"] };
  expect(regionValues(panel)).toEqual({ USA: DEFAULT_REGION_WEIGHT });
});

test("regionValues on empty regions yields an empty map", () => {
  expect(regionValues({ kind: "map", regions: [] })).toEqual({});
});

test("panelKind narrows each member of the union", () => {
  const map: PanelSpec = { kind: "map", regions: ["USA"] };
  const scene: PanelSpec = { kind: "scene", headline: "1859" };
  const chart: PanelSpec = { kind: "chart", data: [{ x: 1, y: 2 }], mark: "line", x: "x", y: "y" };
  expect(panelKind(map)).toBe("map");
  expect(panelKind(scene)).toBe("scene");
  expect(panelKind(chart)).toBe("chart");
});
