/**
 * Validates a `GovArchetypeLibrary` JSON file (2026-07-07-atlas-government-structure-design.md
 * §3.5) beyond what `GovArchetypeLibrarySchema` alone checks: unique archetype IDs
 * and per-archetype slots, non-empty template contents, edges whose endpoints are
 * declared slots, no self-loop edges, valid generic default-basis text (never a
 * country-specific citation), and coverage of the required system-type families
 * (§4.2's ~14 archetypes).
 *
 * Every failure identifies the offending archetype id and, where applicable, the
 * offending slot or edge — this is what `scripts/validate-government-archetypes.test.ts`
 * exercises, and what the integration deliverable
 * (`pnpm exec tsx scripts/validate-government-archetypes.mts <path>`) runs for real
 * against the committed private-repo artifact.
 *
 * Usage (from repo root):
 *   pnpm exec tsx scripts/validate-government-archetypes.mts <path-to-library.json>
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GovArchetypeLibrarySchema, type GovArchetype, type GovArchetypeLibrary } from "../packages/core/src/index.ts";

/** A citation-shaped `defaultBasis` (article/section numbers, § marks) is never a generic default — it belongs in `constitutionalBasis.text` with `basisOrigin: "constitution-coded"` on the assembled record, not in the archetype template. */
const CITATION_LIKE = /\b(art(?:icle)?|sec(?:tion)?)\.?\s*\d+\b|§\s*\d+|\bch(?:apter)?\.?\s*\d+\b/i;

/** The required family coverage (§4.2's ~14 archetypes). `systemType` alone can't
 * distinguish theocratic/hybrid/generic-fallback (all legitimately "other"), so
 * those three match on an id-substring convention instead. */
interface RequiredFamily {
  name: string;
  test: (a: GovArchetype) => boolean;
}
const REQUIRED_FAMILIES: RequiredFamily[] = [
  { name: "parliamentary", test: (a) => a.systemType === "parliamentary" },
  { name: "presidential", test: (a) => a.systemType === "presidential" },
  { name: "semi-presidential", test: (a) => a.systemType === "semi-presidential" },
  { name: "directorial", test: (a) => a.systemType === "directorial" },
  { name: "monarchy", test: (a) => a.systemType === "constitutional-monarchy" || a.systemType === "absolute-monarchy" },
  { name: "one-party", test: (a) => a.systemType === "one-party" },
  { name: "junta/provisional", test: (a) => a.systemType === "military-junta" || a.systemType === "provisional" },
  { name: "theocratic", test: (a) => a.id.toLowerCase().includes("theocra") },
  { name: "hybrid", test: (a) => a.id.toLowerCase().includes("hybrid") },
  { name: "generic fallback", test: (a) => a.id.toLowerCase().includes("fallback") || a.id.toLowerCase().includes("generic") },
];

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** Structural (schema) + semantic validation of an already-parsed library object. */
export function validateLibraryObject(raw: unknown): ValidationResult {
  const parsed = GovArchetypeLibrarySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => `schema: ${issue.path.join(".") || "<root>"}: ${issue.message}`),
    };
  }
  return validateLibrary(parsed.data);
}

/** Semantic validation of an already-schema-valid library. */
export function validateLibrary(library: GovArchetypeLibrary): ValidationResult {
  const errors: string[] = [];

  if (library.archetypes.length === 0) {
    errors.push("library: archetypes array is empty — non-empty template contents required");
  }

  const seenIds = new Set<string>();
  for (const archetype of library.archetypes) {
    if (seenIds.has(archetype.id)) {
      errors.push(`archetype "${archetype.id}": duplicate archetype id`);
    }
    seenIds.add(archetype.id);
    errors.push(...validateArchetype(archetype));
  }

  for (const family of REQUIRED_FAMILIES) {
    if (!library.archetypes.some(family.test)) {
      errors.push(`library: no archetype covers the required "${family.name}" family`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function validateArchetype(archetype: GovArchetype): string[] {
  const errors: string[] = [];
  const id = archetype.id;

  if (!archetype.label.trim()) {
    errors.push(`archetype "${id}": label must be non-empty`);
  }
  if (archetype.institutions.length === 0) {
    errors.push(`archetype "${id}": institutions must be non-empty — a template with no slots has no contents`);
  }
  if (archetype.edges.length === 0) {
    errors.push(`archetype "${id}": edges must be non-empty — a template with no power-flow edges has no contents`);
  }

  const slots = new Set<string>();
  for (const institution of archetype.institutions) {
    if (!institution.slot.trim()) {
      errors.push(`archetype "${id}": institution slot must be non-empty`);
      continue;
    }
    if (slots.has(institution.slot)) {
      errors.push(`archetype "${id}", slot "${institution.slot}": duplicate slot`);
    }
    slots.add(institution.slot);
  }

  for (const edge of archetype.edges) {
    const edgeLabel = `${edge.fromSlot} -> ${edge.toSlot}`;
    if (edge.fromSlot === edge.toSlot) {
      errors.push(`archetype "${id}", edge "${edgeLabel}": self-loop edges are not allowed`);
    }
    if (!slots.has(edge.fromSlot)) {
      errors.push(`archetype "${id}", edge "${edgeLabel}": fromSlot "${edge.fromSlot}" is not a declared institution slot`);
    }
    if (!slots.has(edge.toSlot)) {
      errors.push(`archetype "${id}", edge "${edgeLabel}": toSlot "${edge.toSlot}" is not a declared institution slot`);
    }
    const basis = edge.defaultBasis.trim();
    if (!basis) {
      errors.push(`archetype "${id}", edge "${edgeLabel}": defaultBasis must be non-empty`);
    } else if (CITATION_LIKE.test(basis)) {
      errors.push(
        `archetype "${id}", edge "${edgeLabel}": defaultBasis "${edge.defaultBasis}" looks like a country-specific constitutional citation, not a generic archetype default`,
      );
    } else if (!/^characteristic of a[n]? /i.test(basis)) {
      errors.push(
        `archetype "${id}", edge "${edgeLabel}": defaultBasis "${edge.defaultBasis}" must read as a generic family convention (e.g. "characteristic of a parliamentary system's …"), not a country-specific fact`,
      );
    }
  }

  return errors;
}

function main(): void {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: pnpm exec tsx scripts/validate-government-archetypes.mts <path-to-library.json>");
    process.exit(1);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.error(`[validate-government-archetypes] failed to read/parse ${path}: ${(err as Error).message}`);
    process.exit(1);
  }

  const result = validateLibraryObject(raw);
  if (!result.ok) {
    console.error(`[validate-government-archetypes] ${path}: ${result.errors.length} error(s)`);
    for (const error of result.errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  const archetypeCount = (raw as GovArchetypeLibrary).archetypes?.length ?? 0;
  console.log(`[validate-government-archetypes] ${path}: OK (${archetypeCount} archetypes, all families covered)`);
}

const here = fileURLToPath(import.meta.url);
if (process.argv[1] === here) {
  main();
}
