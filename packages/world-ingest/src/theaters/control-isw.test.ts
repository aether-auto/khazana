import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ControlLayerSchema } from "@khazana/core";
import { expect, test } from "vitest";
import {
  fetchIswControlLayer,
  ISW_CONTROL_QUERY_URL,
  mapIswResponse,
} from "./control-isw.js";

const fixture = JSON.parse(readFileSync(
  fileURLToPath(new URL("./__fixtures__/control-isw/response.json", import.meta.url)),
  "utf8",
)) as unknown;

const input = {
  theaterId: "russia-ukraine-war",
  snapshotAt: "2026-07-15T12:00:00.000Z",
};

test("ISW GeoJSON control features map documented actor labels to side-keyed multipolygons", () => {
  const mapped = mapIswResponse(fixture, input);

  expect(mapped.geometry.features).toEqual([
    {
      type: "Feature",
      properties: { sideId: "russian" },
      geometry: {
        type: "MultiPolygon",
        coordinates: [[[[37, 48], [38, 48], [38, 49], [37, 48]]]],
      },
    },
  ]);
  expect(mapped.layer).toMatchObject({
    geometryStatus: "licensed",
    geometryRef: "data/world/theaters/russia-ukraine-war/control/isw-ctp-2026-07-15.geojson",
    sourceUrl: ISW_CONTROL_QUERY_URL,
    provenance: {
      sourceId: "isw-ctp",
      sourceUrl: ISW_CONTROL_QUERY_URL,
      licenseTier: "derived-only",
      redistribution: false,
      origin: "computed",
      retrievedAt: input.snapshotAt,
      uncertainty: { kind: "none" },
    },
  });
  expect(ControlLayerSchema.parse(mapped.layer)).toEqual(mapped.layer);
});

test("ISW Esri JSON rings map the attributes actor label and retain RFC 7946 multipolygon nesting", () => {
  const mapped = mapIswResponse({
    features: [
      {
        attributes: { actor: "Ukrainian-controlled territory" },
        geometry: {
          rings: [[[31, 49], [32, 49], [32, 50], [31, 49]]],
        },
      },
    ],
  }, input);

  expect(mapped.geometry.features).toEqual([
    {
      type: "Feature",
      properties: { sideId: "ukrainian" },
      geometry: {
        type: "MultiPolygon",
        coordinates: [[[[31, 49], [32, 49], [32, 50], [31, 49]]]],
      },
    },
  ]);
});

test("ISW direct fetch uses an injected fixture fetcher without consulting the permission registry", async () => {
  let requestedUrl = "";
  const mapped = await fetchIswControlLayer(input, async (url) => {
    requestedUrl = url;
    return fixture;
  });

  expect(requestedUrl).toBe(ISW_CONTROL_QUERY_URL);
  expect(ISW_CONTROL_QUERY_URL).toBe("https://services5.arcgis.com/SaBe5HMtmnbqSWlu/ArcGIS/rest/services/Ukraine_Front_Line_NEW/FeatureServer/12/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson");
  expect(mapped.layer.geometryStatus).toBe("licensed");
});

test("ISW stamps redistributable raw provenance only after gated permission", () => {
  const mapped = mapIswResponse(fixture, { ...input, permissionGranted: true });

  expect(mapped.layer.provenance).toMatchObject({
    licenseTier: "redistribute-raw-ok",
    redistribution: true,
    origin: "referenced",
  });
});

test("ISW rejects a feature without a documented or injected side label", () => {
  expect(() => mapIswResponse({
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [37, 48] } }],
  }, input)).toThrow();
});
