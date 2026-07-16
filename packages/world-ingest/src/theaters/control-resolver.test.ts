import { ControlLayerSchema, type ControlLayer } from "@khazana/core";
import { expect, test, vi } from "vitest";
import {
  resolveControlLayer,
  type ControlLayerSources,
  type ControlTheaterInput,
} from "./control-resolver.js";
import { getActiveControlGeometrySources } from "./index.js";
import type { WikipediaControlResult, WikipediaTemplateRegistration } from "./control-wikipedia.js";
import type { ControlGeometryFetchResult, GeoJsonFeatureCollection } from "./geometry-registry.js";

const snapshotAt = "2026-07-15T12:00:00.000Z";
const liveMapUrl = "https://authoritative.example.org/live-map";
const theater: ControlTheaterInput = {
  id: "fixture-theater",
  authoritativeMapUrl: liveMapUrl,
};
const geometry: GeoJsonFeatureCollection = { type: "FeatureCollection", features: [] };
const wikipediaRegistration: WikipediaTemplateRegistration = {
  templateTitle: "Template:Fixture detailed map",
  sourceUrl: "https://en.wikipedia.org/wiki/Template:Fixture_detailed_map",
};

function layer(
  geometryStatus: "licensed" | "fallback",
  providerId: string,
  sourceUrl: string,
): ControlLayer {
  return ControlLayerSchema.parse({
    theaterId: theater.id,
    snapshotAt,
    geometryStatus,
    geometryRef: `data/world/theaters/${theater.id}/control/${providerId}.geojson`,
    sourceUrl,
    reliabilityNote: "Fixture control geometry.",
    provenance: {
      sourceId: providerId,
      sourceUrl,
      methodUrl: "https://authoritative.example.org/method",
      licenseTier: "redistribute-raw-ok",
      redistribution: true,
      origin: "referenced",
      retrievedAt: snapshotAt,
      uncertainty: { kind: "none" },
    },
  });
}

function licensedResult(): ControlGeometryFetchResult {
  return {
    layer: layer("licensed", "deepstatemap", liveMapUrl),
    geometry,
  };
}

function wikipediaResult(): WikipediaControlResult {
  return {
    layer: layer("fallback", "wikipedia-detailed-map", wikipediaRegistration.sourceUrl),
    geometry,
  };
}

function resolverSources(overrides: Partial<ControlLayerSources> = {}): ControlLayerSources {
  return {
    snapshotAt,
    tracker: { requests: [{ provider: "DeepStateMap", status: "pending" }] },
    ...overrides,
  };
}

function expectSchemaRoundTrip(result: ControlLayer): void {
  expect(ControlLayerSchema.parse(result)).toEqual(result);
}

test("resolves a pending licensed candidate to schema-valid link-out-only without fetching", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const result = resolveControlLayer(theater, resolverSources({
    licensed: [{ providerId: "deepstatemap", result: licensedResult() }],
    wikipedia: {
      registrations: {},
      results: { [theater.id]: wikipediaResult() },
    },
  }));

  expect(result).toMatchObject({
    geometryStatus: "link-out-only",
    geometryRef: null,
    sourceUrl: liveMapUrl,
    reliabilityNote: "Front-line geometry is published by ISW/DeepState under terms that require permission to embed; view their live map →",
  });
  expectSchemaRoundTrip(result);
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
});

test("uses only a registered Wikipedia fixture result when licensed permission is pending", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const fallback = wikipediaResult();
  const result = resolveControlLayer(theater, resolverSources({
    licensed: [{ providerId: "deepstatemap", result: licensedResult() }],
    wikipedia: {
      registrations: { [theater.id]: wikipediaRegistration },
      results: { [theater.id]: fallback },
    },
  }));

  expect(result).toEqual(fallback.layer);
  expect(result).toMatchObject({ geometryStatus: "fallback", geometryRef: expect.any(String) });
  expectSchemaRoundTrip(result);
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
});

test("uses a granted licensed result ahead of a registered Wikipedia fixture", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const licensed = licensedResult();
  const result = resolveControlLayer(theater, resolverSources({
    tracker: { requests: [{ provider: "DeepStateMap", status: "granted" }] },
    licensed: [{ providerId: "deepstatemap", result: licensed }],
    wikipedia: {
      registrations: { [theater.id]: wikipediaRegistration },
      results: { [theater.id]: wikipediaResult() },
    },
  }));

  expect(result).toEqual(licensed.layer);
  expect(result).toMatchObject({ geometryStatus: "licensed", geometryRef: expect.any(String) });
  expectSchemaRoundTrip(result);
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
});

test("default source list remains Wikipedia-only while the checked-in permission tracker is pending", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const providers = getActiveControlGeometrySources().map((source) => source.providerId);

  expect(providers).toEqual(["wikipedia"]);
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
});
