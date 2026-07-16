import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ControlLayerSchema } from "@khazana/core";
import { expect, test } from "vitest";
import {
  DEEPSTATE_HISTORY_URL,
  fetchDeepStateControlLayer,
  mapDeepStateResponse,
} from "./control-deepstate.js";

const fixture = JSON.parse(readFileSync(
  fileURLToPath(new URL("./__fixtures__/control-deepstate/response.json", import.meta.url)),
  "utf8",
)) as unknown;

const input = {
  theaterId: "russia-ukraine-war",
  snapshotAt: "2026-07-15T12:00:00.000Z",
};

test("DeepState occupied GeoJSON maps valid multipolygons with derived-only licensed provenance", () => {
  const mapped = mapDeepStateResponse(fixture, input);

  expect(mapped.geometry).toEqual({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { sideId: "russian" },
        geometry: {
          type: "MultiPolygon",
          coordinates: [[[[36, 47], [37, 47], [37, 48], [36, 47]]]],
        },
      },
    ],
  });
  expect(mapped.layer).toMatchObject({
    geometryStatus: "licensed",
    geometryRef: "data/world/theaters/russia-ukraine-war/control/deepstatemap-2026-07-15.geojson",
    sourceUrl: DEEPSTATE_HISTORY_URL,
    provenance: {
      sourceId: "deepstatemap",
      sourceUrl: DEEPSTATE_HISTORY_URL,
      licenseTier: "derived-only",
      redistribution: false,
      origin: "computed",
      retrievedAt: input.snapshotAt,
      uncertainty: { kind: "none" },
    },
  });
  expect(ControlLayerSchema.parse(mapped.layer)).toEqual(mapped.layer);
});

test("DeepState direct fetch uses an injected fixture fetcher without consulting the permission registry", async () => {
  let requestedUrl = "";
  const mapped = await fetchDeepStateControlLayer(input, async (url) => {
    requestedUrl = url;
    return fixture;
  });

  expect(requestedUrl).toBe(DEEPSTATE_HISTORY_URL);
  expect(DEEPSTATE_HISTORY_URL).toBe("https://api.deepstatemap.live/api/history/last");
  expect(mapped.layer.geometryStatus).toBe("licensed");
});

test("DeepState stamps redistributable raw provenance only after gated permission", () => {
  const mapped = mapDeepStateResponse(fixture, { ...input, permissionGranted: true });

  expect(mapped.layer.provenance).toMatchObject({
    licenseTier: "redistribute-raw-ok",
    redistribution: true,
    origin: "referenced",
  });
});

test("DeepState first live GeoJSON layer maps occupied territory when side fields are absent", () => {
  const occupiedGeometry = (fixture as { features: Array<{ geometry: unknown }> }).features[0]!.geometry;
  const mapped = mapDeepStateResponse({
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: {}, geometry: occupiedGeometry },
      { type: "Feature", properties: {}, geometry: occupiedGeometry },
    ],
  }, input);

  expect(mapped.geometry.features).toHaveLength(1);
  expect(mapped.geometry.features[0]?.properties.sideId).toBe("russian");
});

test("DeepState rejects malformed or unknown occupied geometry before mapping", () => {
  expect(() => mapDeepStateResponse({ type: "FeatureCollection", features: [{ type: "Feature", properties: { zone: "occupied" }, geometry: null }] }, input)).toThrow();
  expect(() => mapDeepStateResponse({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: fixture }] }, input)).toThrow();
});
