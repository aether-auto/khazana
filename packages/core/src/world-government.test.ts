import { expect, test } from "vitest";
import {
  ChamberSchema,
  CountryCodeSchema,
  ElectionSystemSchema,
  ExecutiveBlockSchema,
  FederalTierSchema,
  GovArchetypeLibrarySchema,
  GovArchetypeSchema,
  GovernmentStructureSchema,
  InstitutionSchema,
  JudiciaryBlockSchema,
  PowerFlowEdgeSchema,
  SystemTypeAssessmentSchema,
} from "./world-government.js";

const baseProv = {
  sourceId: "wikidata",
  sourceUrl: "https://www.wikidata.org/wiki/Q668",
  methodUrl: "https://www.wikidata.org/wiki/Wikidata:Data_access",
  licenseTier: "redistribute-raw-ok" as const,
  redistribution: true,
  origin: "referenced" as const,
  retrievedAt: "2026-07-07T12:00:00.000Z",
  uncertainty: { kind: "none" as const },
};

function institution(overrides: Partial<Parameters<typeof InstitutionSchema.parse>[0]> = {}) {
  return {
    id: "ind-president",
    name: "President of India",
    branch: "executive" as const,
    tier: "national" as const,
    kind: "head-of-state" as const,
    provenance: baseProv,
    ...overrides,
  };
}

const president = institution();
const pm = institution({ id: "ind-pm", name: "Prime Minister of India", kind: "head-of-government" as const });
const loksabha = {
  id: "ind-loksabha",
  name: "Lok Sabha",
  branch: "legislative" as const,
  tier: "national" as const,
  kind: "chamber" as const,
  provenance: baseProv,
  seats: 545,
  termLengthYears: 5,
  selection: "direct-election" as const,
  electoralSystemFamily: "FPTP",
  isLowerHouse: true,
};
const rajyasabha = {
  id: "ind-rajyasabha",
  name: "Rajya Sabha",
  branch: "legislative" as const,
  tier: "national" as const,
  kind: "chamber" as const,
  provenance: baseProv,
  seats: 245,
  termLengthYears: 6,
  selection: "indirect-election" as const,
  electoralSystemFamily: "list-PR",
  isLowerHouse: false,
};
const supremeCourt = institution({ id: "ind-supreme-court", name: "Supreme Court of India", branch: "judicial" as const, kind: "apex-court" as const });

const fullStructure = {
  country: "IND",
  name: "India",
  systemType: {
    systemType: "parliamentary" as const,
    archetypeId: "westminster-parliamentary",
    classifiers: [{ sourceId: "dpi-2020", verdict: "parliamentary" }],
    provenance: baseProv,
  },
  executive: {
    headOfState: { institutionId: "ind-president", selection: "indirect-election" as const, provenance: baseProv },
    headOfGovernment: { institutionId: "ind-pm", selection: "legislature-elected" as const, provenance: baseProv },
    fused: false,
  },
  chambers: [loksabha, rajyasabha],
  judiciary: { apexCourtId: "ind-supreme-court", judicialReview: "yes" as const, appointment: "appointment" as const, provenance: baseProv },
  federalTiers: [{ tier: "state" as const, unitLabel: "states", unitCount: 28, selfRuleScore: 65, provenance: baseProv }],
  electionSystems: [{ office: "Lok Sabha", systemFamily: "FPTP", provenance: baseProv }],
  institutions: [
    president,
    pm,
    { id: loksabha.id, name: loksabha.name, branch: loksabha.branch, tier: loksabha.tier, kind: loksabha.kind, provenance: loksabha.provenance },
    { id: rajyasabha.id, name: rajyasabha.name, branch: rajyasabha.branch, tier: rajyasabha.tier, kind: rajyasabha.kind, provenance: rajyasabha.provenance },
    supremeCourt,
  ],
  powerFlow: [
    {
      from: "ind-president",
      to: "ind-pm",
      relation: "appoints" as const,
      constitutionalBasis: { text: "Article 75", basisOrigin: "constitution-coded" as const, sourceUrl: "https://www.constitutionofindia.net/articles/article-75" },
      provenance: baseProv,
    },
    {
      from: "ind-loksabha",
      to: "ind-pm",
      relation: "confidence" as const,
      constitutionalBasis: { text: "characteristic of a parliamentary system", basisOrigin: "archetype-default" as const },
      provenance: baseProv,
    },
  ],
  completenessScore: 92,
  fieldProvenance: [
    { fieldGroup: "system-type" as const, winningSourceId: "dpi-2020", consideredSourceIds: ["dpi-2020", "vdem"] },
    { fieldGroup: "chambers" as const, winningSourceId: "ipu-parline", consideredSourceIds: ["ipu-parline", "factbook"], divergence: "IPU Parline: 545 · CIA Factbook: 543 — Parline preferred, live source" },
  ],
  assembledAt: "2026-07-07T12:00:00.000Z",
};

test("CountryCodeSchema accepts alpha-3 and rejects alpha-2/lowercase", () => {
  expect(CountryCodeSchema.parse("IND")).toBe("IND");
  expect(CountryCodeSchema.safeParse("IN").success).toBe(false);
  expect(CountryCodeSchema.safeParse("ind").success).toBe(false);
  expect(CountryCodeSchema.safeParse("INDIA").success).toBe(false);
});

test("GovernmentStructureSchema round-trips a fully-populated India fixture", () => {
  const parsed = GovernmentStructureSchema.parse(fullStructure);
  expect(parsed).toEqual(fullStructure);
});

test("federalTiers and electionSystems default to [] when omitted", () => {
  const { federalTiers, electionSystems, ...rest } = fullStructure;
  const parsed = GovernmentStructureSchema.parse(rest);
  expect(parsed.federalTiers).toEqual([]);
  expect(parsed.electionSystems).toEqual([]);
});

test("PowerFlowEdgeSchema accepts both constitutionalBasis origins", () => {
  expect(
    PowerFlowEdgeSchema.parse({
      from: "a",
      to: "b",
      relation: "appoints",
      constitutionalBasis: { text: "Art. 75", basisOrigin: "constitution-coded" },
      provenance: baseProv,
    }).constitutionalBasis?.basisOrigin,
  ).toBe("constitution-coded");
  expect(
    PowerFlowEdgeSchema.parse({
      from: "a",
      to: "b",
      relation: "confidence",
      constitutionalBasis: { text: "characteristic of a parliamentary system", basisOrigin: "archetype-default" },
      provenance: baseProv,
    }).constitutionalBasis?.basisOrigin,
  ).toBe("archetype-default");
});

test("rejects an institution missing required provenance", () => {
  const { provenance, ...noProv } = president;
  expect(InstitutionSchema.safeParse(noProv).success).toBe(false);
});

test("rejects an invalid power relation", () => {
  expect(
    PowerFlowEdgeSchema.safeParse({ from: "a", to: "b", relation: "influences", provenance: baseProv }).success,
  ).toBe(false);
});

test("rejects an invalid system type", () => {
  expect(
    SystemTypeAssessmentSchema.safeParse({
      systemType: "anarcho-syndicalist",
      archetypeId: "x",
      classifiers: [],
      provenance: baseProv,
    }).success,
  ).toBe(false);
});

test("rejects a malformed country code on GovernmentStructure", () => {
  expect(GovernmentStructureSchema.safeParse({ ...fullStructure, country: "IN" }).success).toBe(false);
});

test("ChamberSchema, ExecutiveBlockSchema, JudiciaryBlockSchema, FederalTierSchema, ElectionSystemSchema round-trip", () => {
  expect(ChamberSchema.parse(loksabha)).toEqual(loksabha);
  expect(ExecutiveBlockSchema.parse(fullStructure.executive)).toEqual(fullStructure.executive);
  expect(JudiciaryBlockSchema.parse(fullStructure.judiciary)).toEqual(fullStructure.judiciary);
  expect(FederalTierSchema.parse(fullStructure.federalTiers[0])).toEqual(fullStructure.federalTiers[0]);
  expect(ElectionSystemSchema.parse(fullStructure.electionSystems[0])).toEqual(fullStructure.electionSystems[0]);
});

const archetype = {
  id: "westminster-parliamentary",
  systemType: "parliamentary" as const,
  label: "Westminster Parliamentary",
  institutions: [
    { branch: "executive" as const, tier: "national" as const, kind: "head-of-state" as const, slot: "head-of-state" },
    { branch: "legislative" as const, tier: "national" as const, kind: "chamber" as const, slot: "lower-house" },
  ],
  edges: [{ fromSlot: "lower-house", toSlot: "head-of-government", relation: "confidence" as const, defaultBasis: "characteristic of a parliamentary system" }],
};

test("GovArchetypeSchema round-trips", () => {
  expect(GovArchetypeSchema.parse(archetype)).toEqual(archetype);
});

test("GovArchetypeLibrarySchema round-trips and defaults version/archetypes", () => {
  const full = { version: 2, archetypes: [archetype] };
  expect(GovArchetypeLibrarySchema.parse(full)).toEqual(full);
  expect(GovArchetypeLibrarySchema.parse({})).toEqual({ version: 1, archetypes: [] });
});