// packages/generate/src/component-catalog.ts
//
// Builds the machine-readable component CATALOG writer skills consult during
// Internalize: for every authorable MDX component, its blurb, compact props
// summary, which format kit(s) it belongs to, and its LIVE usage count across
// shipped Reads. This is the enforcement counterpart to the density gate
// (`richness.ts`) — where richness catches an under-built READ, the catalog
// exists so a writer can actually find the right component instead of
// defaulting to the same 2-3 every time (the confirmed root cause: 23 of 44
// components were orphans used in 0 reads).
//
// CONTRACT_COMPONENTS + COMPONENT_METADATA (component-contract.ts) stay the
// single source of truth for names/blurbs/props/kits; this module only adds
// the LIVE part (usage counts scanned from real content).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CONTRACT_COMPONENTS, COMPONENT_METADATA, type FormatKit } from "./component-contract.js";

export interface ComponentCatalogEntry {
  name: string;
  blurb: string;
  props: string;
  kits: readonly FormatKit[];
  /** Number of DISTINCT shipped `.mdx` files that use this component at least once. */
  usageCount: number;
}

export interface ComponentCatalog {
  generatedAt: string;
  components: ComponentCatalogEntry[];
}

/** Component name -> number of distinct files it appears in at least once. */
function countUsageByFile(contentDir: string): Map<string, number> {
  const counts = new Map<string, number>();
  if (!existsSync(contentDir)) return counts;
  for (const file of readdirSync(contentDir)) {
    if (!file.endsWith(".mdx")) continue;
    const body = readFileSync(join(contentDir, file), "utf8");
    const seenInThisFile = new Set<string>();
    for (const m of body.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)) seenInThisFile.add(m[1]!);
    for (const name of seenInThisFile) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

export function buildComponentCatalog(contentDir: string, now: string): ComponentCatalog {
  const usage = countUsageByFile(contentDir);
  const components = CONTRACT_COMPONENTS.map((name) => {
    const meta = COMPONENT_METADATA[name];
    return {
      name,
      blurb: meta.blurb,
      props: meta.props,
      kits: meta.kits,
      usageCount: usage.get(name) ?? 0,
    };
  });
  return { generatedAt: now, components };
}
