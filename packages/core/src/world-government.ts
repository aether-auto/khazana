import { z } from "zod";
import { ProvenanceSchema } from "./world-provenance.js";
import { GovBranchSchema, GovTierSchema, InstitutionKindSchema, PowerRelationSchema, SelectionMethodSchema, SystemTypeSchema } from "./vocab.js";

/**
 * Atlas Government Structure — the shared contract every country's assembled
 * `GovernmentStructure` record satisfies. See
 * docs/superpowers/specs/2026-07-07-atlas-government-structure-design.md §3.
 *
 * TEMP local copy matching world-indicator.ts CountryCodeSchema (ISO 3166-1 alpha-3) —
 * replace w import once spine-indicator-schemas merges.
 */
export const CountryCodeSchema = z.string().regex(/^[A-Z]{3}$/, "expected ISO 3166-1 alpha-3");
export type CountryCode = z.infer<typeof CountryCodeSchema>;

// §3.2 — a node in the power-flow graph: office/body, its branch/tier/kind, and provenance.
export const InstitutionSchema = z.object({
  id: z.string(), // stable within a country, e.g. "ind-loksabha", "ind-president"
  name: z.string(), // real name from source data, e.g. "Lok Sabha", "Bundesrat"
  branch: GovBranchSchema,
  tier: GovTierSchema,
  kind: InstitutionKindSchema,
  provenance: ProvenanceSchema, // decision 3: per-institution, not per-page
});
export type Institution = z.infer<typeof InstitutionSchema>;

// §3.2 — a legislative chamber specialization of Institution.
export const ChamberSchema = InstitutionSchema.extend({
  kind: z.literal("chamber"),
  seats: z.number().int().positive().optional(), // IPU Parline primary; Wikidata/Factbook/DPI fallback
  termLengthYears: z.number().positive().optional(),
  selection: SelectionMethodSchema,
  electoralSystemFamily: z.string().optional(), // "FPTP" | "list-PR" | "MMP" | "TRS" | … (IPU Parline / IDEA ESD)
  isLowerHouse: z.boolean().optional(), // omitted for unicameral
});
export type Chamber = z.infer<typeof ChamberSchema>;

// §3.2 — head-of-state / head-of-government pairing.
export const ExecutiveBlockSchema = z.object({
  headOfState: z.object({ institutionId: z.string(), selection: SelectionMethodSchema, provenance: ProvenanceSchema }),
  headOfGovernment: z.object({ institutionId: z.string(), selection: SelectionMethodSchema, provenance: ProvenanceSchema }),
  /** True where one person holds both roles (US president; a directly-elected HoS+HoG). */
  fused: z.boolean(),
});
export type ExecutiveBlock = z.infer<typeof ExecutiveBlockSchema>;

// §3.2 — apex/constitutional-court review posture.
export const JudiciaryBlockSchema = z.object({
  apexCourtId: z.string(),
  /** Does an apex/constitutional court review the constitutionality of legislation? CCP-coded. */
  judicialReview: z.enum(["yes", "limited", "no", "unknown"]),
  appointment: SelectionMethodSchema,
  provenance: ProvenanceSchema,
});
export type JudiciaryBlock = z.infer<typeof JudiciaryBlockSchema>;

// §3.2 — a sub-national tier's self-rule signal.
export const FederalTierSchema = z.object({
  tier: GovTierSchema, // "state" | "local"
  unitLabel: z.string(), // "states" | "Länder" | "provinces" | "cantons"
  unitCount: z.number().int().positive().optional(),
  /** 0–100 self-rule signal from RAI/SNG-WOFI where covered; omitted for unitary states. */
  selfRuleScore: z.number().min(0).max(100).optional(),
  provenance: ProvenanceSchema,
});
export type FederalTier = z.infer<typeof FederalTierSchema>;

// §3.2 — an office's electoral system family.
export const ElectionSystemSchema = z.object({
  office: z.string(), // "Lok Sabha" | "President" | "Rajya Sabha"
  systemFamily: z.string(), // same vocabulary as ChamberSchema.electoralSystemFamily
  provenance: ProvenanceSchema,
});
export type ElectionSystem = z.infer<typeof ElectionSystemSchema>;

// §3.3 — a directed authority edge between two institutions.
export const PowerFlowEdgeSchema = z.object({
  from: z.string(), // Institution.id
  to: z.string(), // Institution.id
  relation: PowerRelationSchema,
  /** Constitutional citation where CCP/Constitute provide one; else the archetype's
   *  generic basis ("characteristic of a parliamentary system") — the two are
   *  distinguished by `basisOrigin` so a reader never mistakes a template default
   *  for a country-specific constitutional provision. */
  constitutionalBasis: z
    .object({
      text: z.string(),
      basisOrigin: z.enum(["constitution-coded", "archetype-default"]),
      sourceUrl: z.string().url().optional(),
    })
    .optional(),
  provenance: ProvenanceSchema,
});
export type PowerFlowEdge = z.infer<typeof PowerFlowEdgeSchema>;

// §3.3 — the classifier verdict that picked a country's system type + archetype.
export const SystemTypeAssessmentSchema = z.object({
  systemType: SystemTypeSchema,
  archetypeId: z.string(), // which §4.2 template was instantiated
  /** Each classifier's raw verdict, kept for transparency (decision 4). */
  classifiers: z.array(
    z.object({
      sourceId: z.string(), // "dpi-2020" | "vdem" | "wikidata" | "reign"
      verdict: z.string(),
    }),
  ),
  /** Set when classifiers disagree — rendered honestly, never hidden. */
  divergence: z.string().optional(),
  provenance: ProvenanceSchema,
});
export type SystemTypeAssessment = z.infer<typeof SystemTypeAssessmentSchema>;

// §3.3 — the assembled, per-country record the PowerFlow diagram and Ledger consume.
export const GovernmentStructureSchema = z.object({
  country: CountryCodeSchema, // ISO3, reused from world-indicator.ts
  name: z.string(),
  systemType: SystemTypeAssessmentSchema,
  executive: ExecutiveBlockSchema,
  chambers: z.array(ChamberSchema), // 0 (rare), 1 (unicameral), or 2
  judiciary: JudiciaryBlockSchema,
  federalTiers: z.array(FederalTierSchema).default([]), // empty = unitary state
  electionSystems: z.array(ElectionSystemSchema).default([]),
  institutions: z.array(InstitutionSchema), // the node set (chambers included by reference)
  powerFlow: z.array(PowerFlowEdgeSchema), // the edge set
  /** 0–100. Fraction of required field-groups that cleared sourcing (§5). Gates the page. */
  completenessScore: z.number().min(0).max(100),
  /** Per-field-group divergence + winning-source ledger, for the page's provenance rail. */
  fieldProvenance: z.array(
    z.object({
      fieldGroup: z.enum(["system-type", "executive", "chambers", "judiciary", "federal-tiers", "election-systems"]),
      winningSourceId: z.string(),
      consideredSourceIds: z.array(z.string()),
      divergence: z.string().optional(),
    }),
  ),
  assembledAt: z.string().datetime(),
});
export type GovernmentStructure = z.infer<typeof GovernmentStructureSchema>;

// §3.5 — hand-authored, deterministic system-type template (not AI-generated).
export const GovArchetypeSchema = z.object({
  id: z.string(), // "westminster-parliamentary", "us-presidential", …
  systemType: SystemTypeSchema,
  label: z.string(),
  /** Template institutions with parameter SLOTS the per-country data fills. */
  institutions: z.array(
    InstitutionSchema.pick({ branch: true, tier: true, kind: true }).extend({
      slot: z.string(), // "head-of-state", "lower-house", "apex-court" — matched to real data at assembly
    }),
  ),
  /** Candidate power-flow edges with generic (archetype-default) constitutional basis. */
  edges: z.array(
    z.object({
      fromSlot: z.string(),
      toSlot: z.string(),
      relation: PowerRelationSchema,
      defaultBasis: z.string(), // "characteristic of a parliamentary system"
    }),
  ),
});
export type GovArchetype = z.infer<typeof GovArchetypeSchema>;

// §3.5 — the versioned, committed archetype set the assembler loads from the private repo.
export const GovArchetypeLibrarySchema = z.object({
  version: z.number().int().default(1),
  archetypes: z.array(GovArchetypeSchema).default([]),
});
export type GovArchetypeLibrary = z.infer<typeof GovArchetypeLibrarySchema>;
