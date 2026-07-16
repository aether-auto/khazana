import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type ControlLayer } from "@khazana/core";
import { z } from "zod";
import type {
  GeoJsonFeatureCollection,
  GeoJsonLinearRing,
  GeoJsonMultiPolygonCoordinates,
  GeoJsonPolygonCoordinates,
  GeoJsonPosition,
} from "./control-wikipedia.js";

export type {
  GeoJsonFeatureCollection,
  GeoJsonLinearRing,
  GeoJsonMultiPolygonCoordinates,
  GeoJsonPolygonCoordinates,
  GeoJsonPosition,
} from "./control-wikipedia.js";

export const GEOMETRY_PROVIDER_IDS = ["wikipedia", "deepstatemap", "isw-ctp"] as const;
export type GeometryProviderId = (typeof GEOMETRY_PROVIDER_IDS)[number];
type LicensedGeometryProviderId = Exclude<GeometryProviderId, "wikipedia">;

export interface GeometryTheaterInput {
  readonly id: string;
  readonly authoritativeMapUrl: string;
}

export interface GeoJsonMultiPolygon {
  readonly type: "MultiPolygon";
  readonly coordinates: GeoJsonMultiPolygonCoordinates;
}

export interface ControlGeometryFetchResult {
  readonly layer: ControlLayer;
  readonly geometry: GeoJsonFeatureCollection;
}

export interface ControlGeometrySource {
  readonly providerId: GeometryProviderId;
  readonly geometryStatus: "licensed" | "fallback";
  supports(theater: GeometryTheaterInput): boolean;
  fetch(theater: GeometryTheaterInput): Promise<ControlGeometryFetchResult>;
}

export interface PermissionRegistryOptions {
  /** Test-only override; a malformed value deliberately fails closed. */
  readonly tracker?: unknown;
  /** Test-only tracker location; the checked-in tracker remains the default. */
  readonly trackerPath?: string;
}

const PermissionRequestSchema = z.object({ provider: z.string(), status: z.string() });
const PermissionTrackerSchema = z.object({ requests: z.array(PermissionRequestSchema) });
const trackerProviderById: Readonly<Record<LicensedGeometryProviderId, string>> = {
  deepstatemap: "DeepStateMap",
  "isw-ctp": "ISW/CTP",
};

const defaultTrackerPath = fileURLToPath(
  new URL("../../../../docs/cofounder/permission-requests/theater-geometry.json", import.meta.url),
);

interface PermissionRequest {
  readonly provider: string;
  readonly status: string;
}

interface PermissionTracker {
  readonly requests: readonly PermissionRequest[];
}

export interface RawGeoJsonFeature {
  readonly properties: Readonly<Record<string, unknown>>;
  readonly geometry: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPermissionRequest(value: unknown): value is PermissionRequest {
  return isRecord(value) && typeof value["provider"] === "string" && typeof value["status"] === "string";
}

function isPermissionTracker(value: unknown): value is PermissionTracker {
  return isRecord(value) && Array.isArray(value["requests"]) && value["requests"].every(isPermissionRequest);
}

function parsePermissionTracker(value: unknown): PermissionTracker | null {
  // Check untrusted JSON shapes before Zod receives or maps them.
  if (!isPermissionTracker(value)) return null;
  const parsed = PermissionTrackerSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function readPermissionTracker(options: PermissionRegistryOptions): PermissionTracker | null {
  if (options.tracker !== undefined) return parsePermissionTracker(options.tracker);
  try {
    return parsePermissionTracker(JSON.parse(readFileSync(options.trackerPath ?? defaultTrackerPath, "utf8")) as unknown);
  } catch {
    return null;
  }
}

/** Return true only for a written, exactly-granted provider permission record. */
export function isGeometrySourceEnabled(providerId: GeometryProviderId, options: PermissionRegistryOptions = {}): boolean {
  if (providerId === "wikipedia") return false;
  const tracker = readPermissionTracker(options);
  if (!tracker) return false;
  const expectedProvider = trackerProviderById[providerId];
  return tracker.requests.some((request) => request.provider === expectedProvider && request.status === "granted");
}

/**
 * Return only providers legal to load into an active/default source list. Task 4 can use these
 * IDs to conditionally import source factories, so pending providers are never imported or run.
 */
export function activeGeometryProviderIds(options: PermissionRegistryOptions = {}): readonly GeometryProviderId[] {
  const providers: GeometryProviderId[] = ["wikipedia"];
  for (const providerId of ["deepstatemap", "isw-ctp"] as const) {
    if (isGeometrySourceEnabled(providerId, options)) providers.push(providerId);
  }
  return providers;
}

/** Filter already-constructed sources when a caller does not need lazy provider imports. */
export function activeControlGeometrySources<T extends Pick<ControlGeometrySource, "providerId">>(
  sources: readonly T[],
  options: PermissionRegistryOptions = {},
): T[] {
  const active = new Set(activeGeometryProviderIds(options));
  return sources.filter((source) => active.has(source.providerId));
}

function samePosition(left: GeoJsonPosition, right: GeoJsonPosition): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function isPosition(value: unknown): value is GeoJsonPosition {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const longitude = value[0];
  const latitude = value[1];
  return typeof longitude === "number"
    && Number.isFinite(longitude)
    && longitude >= -180
    && longitude <= 180
    && typeof latitude === "number"
    && Number.isFinite(latitude)
    && latitude >= -90
    && latitude <= 90;
}

function isLinearRing(value: unknown): value is GeoJsonLinearRing {
  if (!Array.isArray(value) || value.length < 4 || !value.every(isPosition)) return false;
  return samePosition(value[0]!, value[value.length - 1]!);
}

function isPolygonCoordinates(value: unknown): value is GeoJsonPolygonCoordinates {
  return Array.isArray(value) && value.length > 0 && value.every(isLinearRing);
}

function isMultiPolygonCoordinates(value: unknown): value is GeoJsonMultiPolygonCoordinates {
  return Array.isArray(value) && value.length > 0 && value.every(isPolygonCoordinates);
}

/** Normalize a valid RFC 7946 Polygon or MultiPolygon to a MultiPolygon. */
export function normalizeMultiPolygon(geometry: unknown): GeoJsonMultiPolygon | null {
  if (!isRecord(geometry) || typeof geometry["type"] !== "string") return null;
  const coordinates = geometry["coordinates"];
  if (geometry["type"] === "Polygon" && isPolygonCoordinates(coordinates)) {
    return { type: "MultiPolygon", coordinates: [coordinates] };
  }
  if (geometry["type"] === "MultiPolygon" && isMultiPolygonCoordinates(coordinates)) {
    return { type: "MultiPolygon", coordinates };
  }
  return null;
}

/** Strictly parse a GeoJSON FeatureCollection before a provider maps its semantics. */
export function extractGeoJsonFeatures(value: unknown): RawGeoJsonFeature[] {
  if (!isRecord(value) || value["type"] !== "FeatureCollection" || !Array.isArray(value["features"])) {
    throw new Error("Expected a GeoJSON FeatureCollection");
  }
  if (value["features"].length === 0) throw new Error("GeoJSON FeatureCollection has no features");

  return value["features"].map((candidate, index) => {
    if (!isRecord(candidate) || candidate["type"] !== "Feature" || !isRecord(candidate["properties"])) {
      throw new Error(`GeoJSON FeatureCollection feature ${index} is malformed`);
    }
    return { properties: candidate["properties"], geometry: candidate["geometry"] };
  });
}

export function makeControlGeometryRef(theaterId: string, providerId: GeometryProviderId, snapshotAt: string): string {
  return `data/world/theaters/${theaterId}/control/${providerId}-${snapshotAt.slice(0, 10)}.geojson`;
}
