import { deepStateControlSource } from "./control-deepstate.js";
import { iswControlSource } from "./control-isw.js";
import { wikipediaControlSource } from "./control-wikipedia.js";
import { activeGeometryProviderIds, type ControlGeometrySource, type PermissionRegistryOptions } from "./geometry-registry.js";

export * from "./control-deepstate.js";
export * from "./control-isw.js";
export * from "./control-resolver.js";
export * from "./control-wikipedia.js";
export * from "./geometry-registry.js";

/** Full registry for explicit orchestration only; exporting this performs no fetches. */
export const allControlGeometrySources: readonly ControlGeometrySource[] = [
  wikipediaControlSource,
  deepStateControlSource,
  iswControlSource,
];

/** Default pipelines must call this gate before selecting fetchable geometry sources. */
export function getActiveControlGeometrySources(options: PermissionRegistryOptions = {}): ControlGeometrySource[] {
  const activeProviders = new Set(activeGeometryProviderIds(options));
  return allControlGeometrySources.filter((source) => activeProviders.has(source.providerId));
}
