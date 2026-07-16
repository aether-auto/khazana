import { ControlLayerSchema, type ControlLayer } from "@khazana/core";
import {
  extractGeoJsonFeatures,
  makeControlGeometryRef,
  normalizeMultiPolygon,
  type ControlGeometryFetchResult,
  type ControlGeometrySource,
  type GeoJsonFeatureCollection,
} from "./geometry-registry.js";

export const DEEPSTATE_HISTORY_URL = "https://api.deepstatemap.live/api/history/last";
export const DEEPSTATE_LIVE_MAP_URL = "https://deepstatemap.live/en";
export const DEEPSTATE_LICENSE_URL = "https://deepstatemap.live/license-en.html";

export type DeepStateSideMapper = (
  properties: Readonly<Record<string, unknown>>,
  featureIndex: number,
) => string | null;

export interface LicensedControlInput {
  readonly theaterId: string;
  readonly snapshotAt: string;
  /** Set only by gated active source after tracker records written permission. */
  readonly permissionGranted?: boolean;
  /** Supports documented provider field changes without accepting an unknown default label. */
  readonly mapSideId?: DeepStateSideMapper;
}

function normalizedLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[ _]+/gu, "-");
}

function defaultDeepStateSideId(properties: Readonly<Record<string, unknown>>, featureIndex: number): string | null {
  const side = properties["sideId"] ?? properties["side"] ?? properties["actor"];
  if (typeof side === "string") {
    const label = normalizedLabel(side);
    if (["russian", "russian-controlled", "russian-controlled-territory"].includes(label)) return "russian";
    if (["ukrainian", "ukrainian-controlled", "ukrainian-controlled-territory"].includes(label)) return "ukrainian";
  }

  const zone = properties["zone"] ?? properties["zoneId"] ?? properties["status"];
  if ([0, 3, "0", "3", "occupied", "occupied-territory"].includes(zone as string | number)) return "russian";
  if ([1, 2, "1", "2", "liberated", "liberated-territory"].includes(zone as string | number)) return null;
  // DeepState's live GeoJSON also defines layer roles by feature order: first feature = occupied area.
  if (zone === undefined && side === undefined) return featureIndex === 0 ? "russian" : null;
  throw new Error("DeepState feature has no documented control-side attribute");
}

function deepStateProvenance(input: LicensedControlInput) {
  if (input.permissionGranted) {
    return {
      sourceId: "deepstatemap",
      sourceUrl: DEEPSTATE_HISTORY_URL,
      methodUrl: DEEPSTATE_LICENSE_URL,
      licenseTier: "redistribute-raw-ok" as const,
      redistribution: true,
      origin: "referenced" as const,
      retrievedAt: input.snapshotAt,
      uncertainty: { kind: "none" as const },
    };
  }
  return {
    sourceId: "deepstatemap",
    sourceUrl: DEEPSTATE_HISTORY_URL,
    methodUrl: DEEPSTATE_LICENSE_URL,
    licenseTier: "derived-only" as const,
    redistribution: false,
    origin: "computed" as const,
    retrievedAt: input.snapshotAt,
    uncertainty: { kind: "none" as const },
  };
}

/** Validate occupied-territory GeoJSON, then map valid Polygon/MultiPolygon features by side. */
export function mapDeepStateResponse(payload: unknown, input: LicensedControlInput): ControlGeometryFetchResult {
  const mapSideId = input.mapSideId ?? defaultDeepStateSideId;
  const features = extractGeoJsonFeatures(payload);
  const geometry: GeoJsonFeatureCollection = {
    type: "FeatureCollection",
    features: features.flatMap((feature, featureIndex) => {
      const normalized = normalizeMultiPolygon(feature.geometry);
      if (!normalized) throw new Error("DeepState feature geometry is not a valid RFC 7946 Polygon or MultiPolygon");
      const sideId = mapSideId(feature.properties, featureIndex);
      return sideId === null
        ? []
        : [{ type: "Feature" as const, properties: { sideId }, geometry: normalized }];
    }),
  };
  if (geometry.features.length === 0) throw new Error("No occupied DeepState control geometry found");

  const layer: ControlLayer = ControlLayerSchema.parse({
    theaterId: input.theaterId,
    snapshotAt: input.snapshotAt,
    geometryStatus: "licensed",
    geometryRef: makeControlGeometryRef(input.theaterId, "deepstatemap", input.snapshotAt),
    sourceUrl: DEEPSTATE_HISTORY_URL,
    reliabilityNote: input.permissionGranted
      ? "DeepStateMap occupied-territory geometry; written redistribution permission recorded."
      : "DeepStateMap occupied-territory geometry, retained only as a non-redistributable derived control layer pending written permission.",
    provenance: deepStateProvenance(input),
  });
  return { layer, geometry };
}

export type DeepStateJsonFetcher = (url: string) => Promise<unknown>;

const defaultDeepStateJsonFetcher: DeepStateJsonFetcher = async (url) => {
  const response = await fetch(url, { headers: { Accept: "application/geo+json, application/json" } });
  if (!response.ok) throw new Error(`DeepStateMap request failed with HTTP ${response.status}`);
  return response.json();
};

/** Directly callable for injected fixture parsing; active source lists must gate this provider separately. */
export async function fetchDeepStateControlLayer(
  input: LicensedControlInput,
  fetchJson: DeepStateJsonFetcher = defaultDeepStateJsonFetcher,
): Promise<ControlGeometryFetchResult> {
  return mapDeepStateResponse(await fetchJson(DEEPSTATE_HISTORY_URL), input);
}

export const deepStateControlSource: ControlGeometrySource = {
  providerId: "deepstatemap",
  geometryStatus: "licensed",
  supports: (theater) => theater.id === "russia-ukraine-war",
  fetch: (theater) => fetchDeepStateControlLayer({
    theaterId: theater.id,
    snapshotAt: new Date().toISOString(),
    permissionGranted: true,
  }),
};
