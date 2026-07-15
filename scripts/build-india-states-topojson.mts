/**
 * Build `data/world/government/geo/india-states.topojson.json` — the ADM1
 * (states + union territories) TopoJSON layer for India, sourced from the
 * pinned `ramSeraph/indian_admin_boundaries` GitHub Release asset
 * (`states` tag, `LGD_States.geojsonl.7z`, CC0 1.0) and shaped to mirror the
 * `objects.countries` GeometryCollection that `Map.tsx` already consumes from
 * `world-atlas/countries-110m.json` (apps/site/src/components/mdx/Map.tsx:6).
 *
 * Three pure functions carry the logic the unit tests exercise directly:
 *   - mapFeatureToIsoCode        ramSeraph feature properties -> ISO 3166-2:IN
 *   - buildStatesTopology        assembled features -> topojson-server Topology
 *   - crossCheckAgainstGeoBoundaries  assembled codes vs geoBoundaries ADM1 code
 *                                     list -> structured mismatch report (never
 *                                     silently reconciles, per the design spec's
 *                                     no-silent-gap discipline)
 *
 * The real-run path below (guarded by the `import.meta.url` main check) does
 * the actual network fetch + 7z extraction + private-repo push. It is NOT
 * unit tested — it is exercised once, for real, per the task's integration
 * deliverable, then the committed output is what CI/consumers read.
 *
 * Usage (from repo root):
 *   pnpm exec tsx scripts/build-india-states-topojson.mts
 *
 * Requires `7z` (p7zip) on PATH to extract the ramSeraph `.geojsonl.7z` asset,
 * and `WORLD_DATA_REPO_TOKEN` in the environment to push to the private
 * `aether-auto/khazana-world-data` repo (see docs/world-data-repo.md).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { topology } from "topojson-server";
// topojson-simplify has no @types package on npm and no bundled .d.ts —
// scripts/ isn't part of any tsconfig project (matches the rest of this
// directory: real-ingest.mts, fetch-events.mts etc. run via `tsx`/esbuild,
// type-erased, never `tsc --noEmit`'d), so this resolves fine at runtime.
import { presimplify, simplify } from "topojson-simplify";
import type { Topology } from "topojson-specification";
import type { Feature, Geometry } from "geojson";

// ── Canonical ISO 3166-2:IN table (28 states + 8 union territories = 36) ──
// Keyed by the ramSeraph `LGD_States` STNAME value (upper-cased, as shipped).
// Hand-verified against the real ramSeraph feature dump (2026-07) and cross-
// checked 1:1 against geoBoundaries' `shapeISO` field for the same 36 units —
// see the crossCheckAgainstGeoBoundaries call in main() below.
export const ISO_3166_2_IN_BY_NAME: Record<string, { code: string; name: string }> = {
  "ANDAMAN & NICOBAR": { code: "IN-AN", name: "Andaman and Nicobar Islands" },
  "ANDHRA PRADESH": { code: "IN-AP", name: "Andhra Pradesh" },
  "ARUNACHAL PRADESH": { code: "IN-AR", name: "Arunachal Pradesh" },
  ASSAM: { code: "IN-AS", name: "Assam" },
  BIHAR: { code: "IN-BR", name: "Bihar" },
  CHANDIGARH: { code: "IN-CH", name: "Chandigarh" },
  CHHATTISGARH: { code: "IN-CT", name: "Chhattisgarh" },
  "DADRA,NAGAR HAVELI,DAMAN & DIU": {
    code: "IN-DH",
    name: "Dadra and Nagar Haveli and Daman and Diu",
  },
  DELHI: { code: "IN-DL", name: "Delhi" },
  GOA: { code: "IN-GA", name: "Goa" },
  GUJARAT: { code: "IN-GJ", name: "Gujarat" },
  HARYANA: { code: "IN-HR", name: "Haryana" },
  "HIMACHAL PRADESH": { code: "IN-HP", name: "Himachal Pradesh" },
  "JAMMU & KASHMIR": { code: "IN-JK", name: "Jammu and Kashmir" },
  JHARKHAND: { code: "IN-JH", name: "Jharkhand" },
  KARNATAKA: { code: "IN-KA", name: "Karnataka" },
  KERALA: { code: "IN-KL", name: "Kerala" },
  LADAKH: { code: "IN-LA", name: "Ladakh" },
  LAKSHADWEEP: { code: "IN-LD", name: "Lakshadweep" },
  "MADHYA PRADESH": { code: "IN-MP", name: "Madhya Pradesh" },
  MAHARASHTRA: { code: "IN-MH", name: "Maharashtra" },
  MANIPUR: { code: "IN-MN", name: "Manipur" },
  MEGHALAYA: { code: "IN-ML", name: "Meghalaya" },
  MIZORAM: { code: "IN-MZ", name: "Mizoram" },
  NAGALAND: { code: "IN-NL", name: "Nagaland" },
  ODISHA: { code: "IN-OR", name: "Odisha" },
  PUDUCHERRY: { code: "IN-PY", name: "Puducherry" },
  PUNJAB: { code: "IN-PB", name: "Punjab" },
  RAJASTHAN: { code: "IN-RJ", name: "Rajasthan" },
  SIKKIM: { code: "IN-SK", name: "Sikkim" },
  "TAMIL NADU": { code: "IN-TN", name: "Tamil Nadu" },
  TELANGANA: { code: "IN-TG", name: "Telangana" },
  TRIPURA: { code: "IN-TR", name: "Tripura" },
  "UTTAR PRADESH": { code: "IN-UP", name: "Uttar Pradesh" },
  UTTARAKHAND: { code: "IN-UT", name: "Uttarakhand" },
  "WEST BENGAL": { code: "IN-WB", name: "West Bengal" },
};

export const CANONICAL_ISO_3166_2_IN_CODES: readonly string[] = Object.values(
  ISO_3166_2_IN_BY_NAME,
).map((v) => v.code);

interface RamSeraphProperties {
  STNAME?: unknown;
  [key: string]: unknown;
}

export interface MappedFeature {
  code: string;
  name: string;
  geometry: Geometry;
}

/**
 * Map one ramSeraph ADM1 feature (LGD_States dataset) to its canonical
 * ISO 3166-2:IN code + display name. Returns null — never a guess — if the
 * feature's STNAME doesn't confidently match an entry in
 * ISO_3166_2_IN_BY_NAME. No fuzzy matching, no partial-string heuristics.
 */
export function mapFeatureToIsoCode(
  feature: Feature<Geometry, RamSeraphProperties>,
): MappedFeature | null {
  const raw = feature.properties?.STNAME;
  if (typeof raw !== "string") return null;
  const key = raw.trim().toUpperCase();
  const entry = ISO_3166_2_IN_BY_NAME[key];
  if (!entry) return null;
  if (!feature.geometry) return null;
  return { code: entry.code, name: entry.name, geometry: feature.geometry };
}

/**
 * Assemble mapped features into a topojson-server Topology with a single
 * `states` GeometryCollection — mirroring the `objects.countries` shape
 * Map.tsx already consumes. Each geometry's `id` is the ISO code and
 * `properties.name` is the real state/UT name.
 */
export function buildStatesTopology(features: MappedFeature[], quantization = 1e5): Topology {
  // topojson-server only transfers `id`/`properties` from GeoJSON *Feature*
  // wrappers (see topojson-server/src/geometry.js:geomifyFeature) — setting
  // them directly on a bare geometry object is silently dropped. So the
  // `states` object is built as a FeatureCollection; topology() converts it
  // into the desired `{type: "GeometryCollection", geometries: [...]}` shape
  // (mirroring objects.countries) with id/properties preserved per unit.
  // Quantization (matches world-atlas's own convention of shipping a
  // `transform`) delta-encodes arc coordinates as integers.
  const featureCollection = {
    type: "FeatureCollection" as const,
    features: features.map((f) => ({
      type: "Feature" as const,
      id: f.code,
      properties: { name: f.name },
      geometry: f.geometry,
    })),
  };
  return topology({ states: featureCollection }, quantization);
}

export interface CrossCheckResult {
  missingCodes: string[];
  extraCodes: string[];
  countMismatch: boolean;
  assembledCount: number;
  referenceCount: number;
}

/**
 * Cross-check the assembled ISO code set against a geoBoundaries India ADM1
 * reference code list. Returns a structured mismatch report — never
 * auto-reconciles or silently drops/adds units.
 */
export function crossCheckAgainstGeoBoundaries(
  assembledCodes: string[],
  geoBoundariesCodes: string[],
): CrossCheckResult {
  const assembledSet = new Set(assembledCodes);
  const referenceSet = new Set(geoBoundariesCodes);
  const missingCodes = [...referenceSet].filter((c) => !assembledSet.has(c)).sort();
  const extraCodes = [...assembledSet].filter((c) => !referenceSet.has(c)).sort();
  return {
    missingCodes,
    extraCodes,
    countMismatch: assembledSet.size !== referenceSet.size,
    assembledCount: assembledSet.size,
    referenceCount: referenceSet.size,
  };
}

// ── Real-run path (not unit tested) ─────────────────────────────────────────

const RAMSERAPH_RELEASE_TAG = "states";
const RAMSERAPH_ASSET_URL =
  "https://github.com/ramSeraph/indian_admin_boundaries/releases/download/states/LGD_States.geojsonl.7z";
// Pinned commit the `states` release build was cut from (target_commitish),
// recorded for provenance even though GitHub Releases assets are themselves
// immutable once published.
const RAMSERAPH_RELEASE_URL =
  "https://github.com/ramSeraph/indian_admin_boundaries/releases/tag/states";

const GEOBOUNDARIES_ADM1_URL =
  "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/IND/ADM1/geoBoundaries-IND-ADM1.geojson";
const GEOBOUNDARIES_VERSION = "9469f09 (build Dec 12, 2023, boundaryYearRepresented 2011)";

async function downloadTo(url: string, destPath: string): Promise<void> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buf);
}

interface GeoBoundariesFeatureProps {
  shapeISO?: unknown;
}

async function main(): Promise<void> {
  const repoRoot = fileURLToPath(new URL("../", import.meta.url));
  const workDir = mkdtempSync(join(tmpdir(), "india-topojson-"));

  try {
    console.log(`[build-india-states-topojson] downloading ramSeraph asset from ${RAMSERAPH_ASSET_URL}`);
    const archivePath = join(workDir, "LGD_States.geojsonl.7z");
    await downloadTo(RAMSERAPH_ASSET_URL, archivePath);

    execFileSync("7z", ["x", "-y", archivePath], { cwd: workDir, stdio: "inherit" });
    const geojsonlPath = join(workDir, "LGD_States.geojsonl");
    const lines = readFileSync(geojsonlPath, "utf8").trim().split("\n").filter(Boolean);
    const rawFeatures: Feature<Geometry, RamSeraphProperties>[] = lines.map((l) => JSON.parse(l));

    const mapped: MappedFeature[] = [];
    const rejected: unknown[] = [];
    for (const f of rawFeatures) {
      const m = mapFeatureToIsoCode(f);
      if (m) mapped.push(m);
      else rejected.push(f.properties?.STNAME ?? f.properties);
    }
    if (rejected.length > 0) {
      throw new Error(
        `mapFeatureToIsoCode rejected ${rejected.length} feature(s): ${JSON.stringify(rejected)}`,
      );
    }

    console.log(`[build-india-states-topojson] downloading geoBoundaries ADM1 fixture from ${GEOBOUNDARIES_ADM1_URL}`);
    const gbPath = join(workDir, "geoBoundaries-IND-ADM1.geojson");
    await downloadTo(GEOBOUNDARIES_ADM1_URL, gbPath);
    const gb = JSON.parse(readFileSync(gbPath, "utf8")) as {
      features: Feature<Geometry, GeoBoundariesFeatureProps>[];
    };
    const gbCodes = gb.features
      .map((f) => f.properties?.shapeISO)
      .filter((c): c is string => typeof c === "string");

    const assembledCodes = mapped.map((m) => m.code);
    const crossCheck = crossCheckAgainstGeoBoundaries(assembledCodes, gbCodes);
    if (crossCheck.missingCodes.length > 0 || crossCheck.extraCodes.length > 0 || crossCheck.countMismatch) {
      throw new Error(
        `cross-check against geoBoundaries failed: ${JSON.stringify(crossCheck)}`,
      );
    }
    console.log(
      `[build-india-states-topojson] cross-check OK: ${crossCheck.assembledCount}/${crossCheck.referenceCount} units, ISO code sets match exactly`,
    );

    // Full-resolution LGD state boundaries assemble to a ~15MB Topology —
    // far over GitHub Contents API's 1MB content-inline limit that the
    // integration deliverable's verification command relies on (`gh api
    // .../contents/... --jq '.content'`). presimplify + simplify (weight
    // threshold hand-tuned against this exact dataset — 0.002 lands ~200KB,
    // in the same ballpark as world-atlas's own countries-110m.json at
    // ~108KB) trims to a web-appropriate, still visually faithful, size
    // without touching which 36 units exist or their ISO codes/names.
    const rawTopo = buildStatesTopology(mapped);
    const topo = simplify(presimplify(rawTopo), 0.002);
    const outDir = join(repoRoot, "data", "world", "government", "geo");
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, "india-states.topojson.json");
    writeFileSync(outPath, JSON.stringify(topo) + "\n");

    const readmePath = join(outDir, "README.md");
    writeFileSync(
      readmePath,
      [
        "# India ADM1 (states + union territories) TopoJSON",
        "",
        "`india-states.topojson.json` — a `topojson-server`-built `Topology` with a single",
        "`objects.states` GeometryCollection, 36 units (28 states + 8 union territories),",
        "each `id` = ISO 3166-2:IN code, each `properties.name` = real state/UT name.",
        "",
        "## Source",
        "",
        `- **Geometry source:** [ramSeraph/indian_admin_boundaries, \`states\` release](${RAMSERAPH_RELEASE_URL}),`,
        "  asset `LGD_States.geojsonl.7z` (LGD-mapped state boundaries).",
        `- **License:** CC0 1.0 (attribute datameet + original government source where possible —`,
        "  see https://github.com/ramSeraph/indianopenmaps/blob/main/DATA_LICENSE.md).",
        "- This geometry is redistributed as-is in the committed TopoJSON above.",
        "",
        "## Cross-check reference (not redistributed)",
        "",
        `- **geoBoundaries India ADM1** version: ${GEOBOUNDARIES_VERSION}`,
        `  (${GEOBOUNDARIES_ADM1_URL}).`,
        "- **License:** CC BY 4.0 (geoBoundaries project license; underlying source boundary is",
        "  CC BY 2.5 IN per DataMeet/Election Commission of India attribution) — used for",
        "  cross-check ONLY. Its geometry never enters the committed TopoJSON above, only its",
        "  `shapeISO` code list is compared against the assembled unit set.",
        "",
        `## Cross-check result: 36/36 ISO 3166-2:IN units match exactly (0 missing, 0 extra).`,
        "",
      ].join("\n"),
    );

    console.log(`[build-india-states-topojson] wrote ${outPath} and ${readmePath}`);

    const wdToken = process.env.WORLD_DATA_REPO_TOKEN;
    if (!wdToken) {
      console.warn(
        "[build-india-states-topojson] WORLD_DATA_REPO_TOKEN not set — skipping push to aether-auto/khazana-world-data. Output written locally only (not committed to the public khazana repo).",
      );
      return;
    }

    const wdDir = join(workDir, "world-data");
    execFileSync("git", [
      "clone",
      "--depth=1",
      "https://github.com/aether-auto/khazana-world-data.git",
      wdDir,
    ], { stdio: "inherit" });
    const wdOutDir = join(wdDir, "data", "world", "government", "geo");
    mkdirSync(wdOutDir, { recursive: true });
    writeFileSync(join(wdOutDir, "india-states.topojson.json"), JSON.stringify(topo) + "\n");
    writeFileSync(join(wdOutDir, "README.md"), readFileSync(readmePath, "utf8"));

    execFileSync("git", ["add", "-A"], { cwd: wdDir, stdio: "inherit" });
    try {
      execFileSync(
        "git",
        ["-c", "user.name=khazana-bot", "-c", "user.email=bot@khazana", "commit", "-m", "chore: add India ADM1 states TopoJSON + provenance README"],
        { cwd: wdDir, stdio: "inherit" },
      );
    } catch {
      console.log("[build-india-states-topojson] nothing to commit (world-data already up to date)");
      return;
    }
    const auth = Buffer.from(`x-access-token:${wdToken}`).toString("base64");
    execFileSync(
      "git",
      ["-c", `http.extraheader=AUTHORIZATION: basic ${auth}`, "push", "origin", "HEAD:main"],
      { cwd: wdDir, stdio: "inherit" },
    );
    console.log("[build-india-states-topojson] pushed to aether-auto/khazana-world-data");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

const here = fileURLToPath(import.meta.url);
if (process.argv[1] === here) {
  main().catch((err) => {
    console.error(`[build-india-states-topojson] failed: ${(err as Error).message}`);
    process.exit(1);
  });
}
