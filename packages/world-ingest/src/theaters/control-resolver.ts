import { ControlLayerSchema, type ControlLayer } from "@khazana/core";
import {
  isGeometrySourceEnabled,
  type ControlGeometryFetchResult,
  type GeometryProviderId,
  type GeometryTheaterInput,
  type PermissionRegistryOptions,
} from "./geometry-registry.js";
import {
  hasWikipediaControlTemplate,
  type WikipediaControlResult,
  type WikipediaTemplateRegistration,
} from "./control-wikipedia.js";

export type ControlTheaterInput = GeometryTheaterInput;
export type LicensedControlProviderId = Exclude<GeometryProviderId, "wikipedia">;

/** A pre-fetched licensed result. Resolution cannot invoke a provider fetcher. */
export interface LicensedControlLayerCandidate {
  readonly providerId: LicensedControlProviderId;
  readonly result: ControlGeometryFetchResult;
}

/** A Wikipedia result is eligible only when its template registration exists for the same theater. */
export interface RegisteredWikipediaControlLayers {
  readonly registrations: Readonly<Record<string, WikipediaTemplateRegistration>>;
  readonly results: Readonly<Record<string, WikipediaControlResult>>;
}

/**
 * Resolver dependencies are materialized results, never fetchable sources. The optional
 * permission tracker override is intentionally test-local; production reads the checked-in
 * tracker through isGeometrySourceEnabled.
 */
export interface ControlLayerSources extends PermissionRegistryOptions {
  readonly snapshotAt?: string;
  readonly licensed?: readonly LicensedControlLayerCandidate[];
  readonly wikipedia?: RegisteredWikipediaControlLayers;
}

const LINK_OUT_RELIABILITY = "Front-line geometry is published by ISW/DeepState under terms that require permission to embed; view their live map →";

function linkOutOnlyLayer(theater: ControlTheaterInput, snapshotAt: string): ControlLayer {
  return ControlLayerSchema.parse({
    theaterId: theater.id,
    snapshotAt,
    geometryStatus: "link-out-only",
    geometryRef: null,
    sourceUrl: theater.authoritativeMapUrl,
    reliabilityNote: LINK_OUT_RELIABILITY,
    provenance: {
      sourceId: "control-link-out",
      sourceUrl: theater.authoritativeMapUrl,
      methodUrl: theater.authoritativeMapUrl,
      licenseTier: "derived-only",
      redistribution: false,
      origin: "computed",
      retrievedAt: snapshotAt,
      uncertainty: { kind: "none" },
    },
  });
}

function selectedLayer(
  layer: ControlLayer,
  theaterId: string,
  geometryStatus: "licensed" | "fallback",
): ControlLayer | null {
  const parsed = ControlLayerSchema.safeParse(layer);
  if (!parsed.success || parsed.data.theaterId !== theaterId || parsed.data.geometryStatus !== geometryStatus) return null;
  return parsed.data;
}

/**
 * Resolve a pre-fetched control-layer posture: licensed permission first, registered Wikipedia
 * fallback second, then link-out-only. This selector is synchronous and performs no network I/O.
 */
export function resolveControlLayer(theater: ControlTheaterInput, sources: ControlLayerSources): ControlLayer {
  for (const candidate of sources.licensed ?? []) {
    if (!isGeometrySourceEnabled(candidate.providerId, sources)) continue;
    const selected = selectedLayer(candidate.result.layer, theater.id, "licensed");
    if (selected) return selected;
  }

  const registrations = sources.wikipedia?.registrations;
  const fallback = sources.wikipedia?.results[theater.id];
  if (registrations && fallback && hasWikipediaControlTemplate(theater.id, registrations)) {
    const selected = selectedLayer(fallback.layer, theater.id, "fallback");
    if (selected) return selected;
  }

  return linkOutOnlyLayer(theater, sources.snapshotAt ?? new Date().toISOString());
}
