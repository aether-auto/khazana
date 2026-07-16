import { ControlLayerSchema, type ControlLayer } from "@khazana/core";
import {
  extractGeoJsonFeatures,
  makeControlGeometryRef,
  normalizeMultiPolygon,
  type ControlGeometryFetchResult,
  type ControlGeometrySource,
  type GeoJsonFeatureCollection,
  type GeoJsonMultiPolygon,
} from "./geometry-registry.js";

export const ISW_CONTROL_LAYER_URL = "https://services5.arcgis.com/SaBe5HMtmnbqSWlu/ArcGIS/rest/services/Ukraine_Front_Line_NEW/FeatureServer/12";
export const ISW_CONTROL_QUERY_URL = `${ISW_CONTROL_LAYER_URL}/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson`;
export const ISW_LICENSE_URL = "https://www.understandingwar.org/fair-use-and-attribution-policy";

export type IswSideMapper = (attributes: Readonly<Record<string, unknown>>) => string | null;

export interface IswControlInput {
  readonly theaterId: string;
  readonly snapshotAt: string;
  /** Set only by gated active source after tracker records written permission. */
  readonly permissionGranted?: boolean;
  /** Optional adapter for a documented ISW/CTP field label not covered by the default mapping. */
  readonly mapSideId?: IswSideMapper;
}

interface EsriFeature {
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly rings: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[ _]+/gu, "-");
}

function defaultIswSideId(attributes: Readonly<Record<string, unknown>>): string | null {
  const label = attributes["sideId"] ?? attributes["side"] ?? attributes["actor"] ?? attributes["controller"] ?? attributes["control"];
  if (typeof label !== "string") throw new Error("ISW feature has no documented side or actor attribute");
  const normalized = normalizedLabel(label);
  if (["russian", "russian-controlled", "russian-controlled-territory"].includes(normalized)) return "russian";
  if (["ukrainian", "ukrainian-controlled", "ukrainian-controlled-territory"].includes(normalized)) return "ukrainian";
  throw new Error(`ISW feature has an unknown side or actor label: ${label}`);
}

function extractEsriFeatures(payload: unknown): EsriFeature[] | null {
  if (!isRecord(payload) || !Array.isArray(payload["features"])) return null;
  if (payload["features"].length === 0) throw new Error("ISW Esri response has no features");
  return payload["features"].map((candidate, index) => {
    if (!isRecord(candidate) || !isRecord(candidate["attributes"]) || !isRecord(candidate["geometry"])) {
      throw new Error(`ISW Esri feature ${index} is malformed`);
    }
    return { attributes: candidate["attributes"], rings: candidate["geometry"]["rings"] };
  });
}

function normalizeEsriRings(rings: unknown): GeoJsonMultiPolygon | null {
  if (!Array.isArray(rings) || rings.length === 0) return null;
  // ArcGIS polygon rings are closed coordinate arrays. Wrapping each ring in a polygon retains
  // valid RFC 7946 MultiPolygon nesting without inventing grouping or hole relationships.
  return normalizeMultiPolygon({ type: "MultiPolygon", coordinates: rings.map((ring) => [ring]) });
}

function iswProvenance(input: IswControlInput) {
  if (input.permissionGranted) {
    return {
      sourceId: "isw-ctp",
      sourceUrl: ISW_CONTROL_QUERY_URL,
      methodUrl: ISW_LICENSE_URL,
      licenseTier: "redistribute-raw-ok" as const,
      redistribution: true,
      origin: "referenced" as const,
      retrievedAt: input.snapshotAt,
      uncertainty: { kind: "none" as const },
    };
  }
  return {
    sourceId: "isw-ctp",
    sourceUrl: ISW_CONTROL_QUERY_URL,
    methodUrl: ISW_LICENSE_URL,
    licenseTier: "derived-only" as const,
    redistribution: false,
    origin: "computed" as const,
    retrievedAt: input.snapshotAt,
    uncertainty: { kind: "none" as const },
  };
}

/** Accept ISW/CTP GeoJSON or Esri FeatureServer rings, rejecting unlabeled or malformed input. */
export function mapIswResponse(payload: unknown, input: IswControlInput): ControlGeometryFetchResult {
  const mapSideId = input.mapSideId ?? defaultIswSideId;
  let features: GeoJsonFeatureCollection["features"];

  if (isRecord(payload) && payload["type"] === "FeatureCollection") {
    features = extractGeoJsonFeatures(payload).map((feature) => {
      const geometry = normalizeMultiPolygon(feature.geometry);
      if (!geometry) throw new Error("ISW GeoJSON feature geometry is not a valid RFC 7946 Polygon or MultiPolygon");
      const sideId = mapSideId(feature.properties);
      if (sideId === null) throw new Error("ISW GeoJSON feature mapping returned no side ID");
      return { type: "Feature" as const, properties: { sideId }, geometry };
    });
  } else {
    const esriFeatures = extractEsriFeatures(payload);
    if (!esriFeatures) throw new Error("Expected an ISW GeoJSON FeatureCollection or Esri FeatureServer response");
    features = esriFeatures.map((feature) => {
      const geometry = normalizeEsriRings(feature.rings);
      if (!geometry) throw new Error("ISW Esri feature rings are not valid RFC 7946 polygon coordinates");
      const sideId = mapSideId(feature.attributes);
      if (sideId === null) throw new Error("ISW Esri feature mapping returned no side ID");
      return { type: "Feature" as const, properties: { sideId }, geometry };
    });
  }

  if (features.length === 0) throw new Error("No ISW control geometry found");
  const geometry: GeoJsonFeatureCollection = { type: "FeatureCollection", features };
  const layer: ControlLayer = ControlLayerSchema.parse({
    theaterId: input.theaterId,
    snapshotAt: input.snapshotAt,
    geometryStatus: "licensed",
    geometryRef: makeControlGeometryRef(input.theaterId, "isw-ctp", input.snapshotAt),
    sourceUrl: ISW_CONTROL_QUERY_URL,
    reliabilityNote: input.permissionGranted
      ? "ISW/CTP control assessment; written redistribution permission recorded."
      : "ISW/CTP control assessment, retained only as a non-redistributable derived control layer pending written permission.",
    provenance: iswProvenance(input),
  });
  return { layer, geometry };
}

export type IswJsonFetcher = (url: string) => Promise<unknown>;

const defaultIswJsonFetcher: IswJsonFetcher = async (url) => {
  const response = await fetch(url, { headers: { Accept: "application/geo+json, application/json" } });
  if (!response.ok) throw new Error(`ISW FeatureServer request failed with HTTP ${response.status}`);
  return response.json();
};

/** Directly callable for injected fixture parsing; active source lists must gate this provider separately. */
export async function fetchIswControlLayer(
  input: IswControlInput,
  fetchJson: IswJsonFetcher = defaultIswJsonFetcher,
): Promise<ControlGeometryFetchResult> {
  return mapIswResponse(await fetchJson(ISW_CONTROL_QUERY_URL), input);
}

export const iswControlSource: ControlGeometrySource = {
  providerId: "isw-ctp",
  geometryStatus: "licensed",
  supports: (theater) => theater.id === "russia-ukraine-war",
  fetch: (theater) => fetchIswControlLayer({
    theaterId: theater.id,
    snapshotAt: new Date().toISOString(),
    permissionGranted: true,
  }),
};
