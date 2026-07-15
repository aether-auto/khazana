// apps/site/src/components/mdx/power-flow-ssr.test.ts
//
// SSR / no-JS fallback tests for the <PowerFlow> React island. The repo's vitest
// runs in the Node environment (no jsdom), so we render via react-dom/server's
// renderToStaticMarkup through createElement (no JSX) and assert the static HTML
// carries the whole GovernmentStructure — institution table, per-branch facts, a
// semantic source→relation→target edge list, the relation legend, provenance
// links, per-edge constitutional basis, the caption, and EVERY divergence note.
// No hydration, no browser APIs.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import PowerFlow from "./PowerFlow.js";
import type { GovernmentStructure, Provenance } from "@khazana/core";

// A reusable, schema-valid Provenance stub (the fallback only reads sourceId /
// sourceUrl / methodUrl; the rest satisfies the type).
function prov(sourceId: string): Provenance {
  return {
    sourceId,
    sourceUrl: `https://example.org/${sourceId}/datum`,
    methodUrl: `https://example.org/${sourceId}/method`,
    licenseTier: "redistribute-raw-ok",
    redistribution: true,
    origin: "referenced",
    retrievedAt: "2026-07-01T00:00:00.000Z",
    uncertainty: { kind: "none" },
  };
}

// A complete, typed GovernmentStructure fixture spanning every field group,
// including BOTH a system-type divergence and a field-provenance divergence.
const structure: GovernmentStructure = {
  country: "IND",
  name: "Republic of India",
  systemType: {
    systemType: "parliamentary",
    archetypeId: "westminster-parliamentary",
    classifiers: [
      { sourceId: "dpi-2020", verdict: "parliamentary" },
      { sourceId: "vdem", verdict: "parliamentary-federal" },
    ],
    divergence: "REIGN codes a semi-presidential variant; DPI + V-Dem agree on parliamentary.",
    provenance: prov("ccp"),
  },
  executive: {
    headOfState: { institutionId: "ind-president", selection: "indirect-election", provenance: prov("wikidata") },
    headOfGovernment: { institutionId: "ind-pm", selection: "legislature-elected", provenance: prov("wikidata") },
    fused: false,
  },
  chambers: [
    {
      id: "ind-loksabha",
      name: "Lok Sabha",
      branch: "legislative",
      tier: "national",
      kind: "chamber",
      seats: 543,
      termLengthYears: 5,
      selection: "direct-election",
      electoralSystemFamily: "FPTP",
      isLowerHouse: true,
      provenance: prov("ipu-parline"),
    },
    {
      id: "ind-rajyasabha",
      name: "Rajya Sabha",
      branch: "legislative",
      tier: "national",
      kind: "chamber",
      seats: 245,
      selection: "indirect-election",
      isLowerHouse: false,
      provenance: prov("ipu-parline"),
    },
  ],
  judiciary: {
    apexCourtId: "ind-sc",
    judicialReview: "yes",
    appointment: "appointment",
    provenance: prov("ccp"),
  },
  federalTiers: [
    { tier: "state", unitLabel: "states", unitCount: 28, selfRuleScore: 62, provenance: prov("rai") },
  ],
  electionSystems: [
    { office: "Lok Sabha", systemFamily: "FPTP", provenance: prov("idea-esd") },
    { office: "President", systemFamily: "electoral-college", provenance: prov("idea-esd") },
  ],
  institutions: [
    { id: "ind-president", name: "President", branch: "executive", tier: "national", kind: "head-of-state", provenance: prov("wikidata") },
    { id: "ind-pm", name: "Prime Minister", branch: "executive", tier: "national", kind: "head-of-government", provenance: prov("wikidata") },
    { id: "ind-loksabha", name: "Lok Sabha", branch: "legislative", tier: "national", kind: "chamber", provenance: prov("ipu-parline") },
    { id: "ind-rajyasabha", name: "Rajya Sabha", branch: "legislative", tier: "national", kind: "chamber", provenance: prov("ipu-parline") },
    { id: "ind-sc", name: "Supreme Court", branch: "judicial", tier: "national", kind: "apex-court", provenance: prov("wikidata") },
    { id: "ind-eci", name: "Election Commission", branch: "electoral", tier: "national", kind: "election-authority", provenance: prov("wikidata") },
    { id: "ind-governor", name: "State Governor", branch: "executive", tier: "state", kind: "subnational-executive", provenance: prov("wikidata") },
  ],
  powerFlow: [
    {
      from: "ind-president",
      to: "ind-loksabha",
      relation: "dissolves",
      constitutionalBasis: {
        text: "Article 85(2)(b): the President may dissolve the Lok Sabha.",
        basisOrigin: "constitution-coded",
        sourceUrl: "https://example.org/constitution/art85",
      },
      provenance: prov("ccp"),
    },
    {
      from: "ind-loksabha",
      to: "ind-pm",
      relation: "confidence",
      constitutionalBasis: {
        text: "Characteristic of a parliamentary system: the cabinet holds the confidence of the lower house.",
        basisOrigin: "archetype-default",
      },
      provenance: prov("archetype"),
    },
    { from: "ind-pm", to: "ind-president", relation: "appoints", provenance: prov("ccp") },
    { from: "ind-sc", to: "ind-loksabha", relation: "reviews", provenance: prov("ccp") },
    { from: "ind-eci", to: "ind-loksabha", relation: "elects", provenance: prov("wikidata") },
  ],
  completenessScore: 92,
  fieldProvenance: [
    { fieldGroup: "system-type", winningSourceId: "dpi-2020", consideredSourceIds: ["dpi-2020", "vdem", "reign"] },
    {
      fieldGroup: "chambers",
      winningSourceId: "ipu-parline",
      consideredSourceIds: ["ipu-parline", "wikidata"],
      divergence: "Wikidata lists 545 Lok Sabha seats; IPU Parline (winning) records 543.",
    },
  ],
  assembledAt: "2026-07-10T12:00:00.000Z",
};

test("PowerFlow SSR renders a non-blank figure with panel + svg", () => {
  const html = renderToStaticMarkup(createElement(PowerFlow, { structure }));
  expect(html.length).toBeGreaterThan(0);
  expect(html).toContain("mdx-figure");
  expect(html).toContain("pf-panel");
  expect(html).toContain("<svg");
  expect(html).toContain("pf-fallback");
});

test("SSR fallback has a headed institution table with every institution + branch/tier/kind", () => {
  const html = renderToStaticMarkup(createElement(PowerFlow, { structure }));
  expect(html).toContain("pf-fallback-table");
  // table headers
  for (const head of ["Institution", "Branch", "Tier", "Kind"]) expect(html).toContain(head);
  // every institution name + its kind
  for (const inst of structure.institutions) {
    expect(html).toContain(inst.name);
    expect(html).toContain(inst.kind);
  }
});

test("SSR fallback surfaces system / executive / chamber / judiciary / federal / election facts", () => {
  const html = renderToStaticMarkup(createElement(PowerFlow, { structure }));
  // system
  expect(html).toContain("parliamentary");
  expect(html).toContain("westminster-parliamentary");
  expect(html).toContain("dpi-2020");
  // executive facts
  expect(html).toContain("Head of state");
  expect(html).toContain("Head of government");
  expect(html).toContain("legislature-elected");
  // chamber facts
  expect(html).toContain("543 seats");
  expect(html).toContain("FPTP");
  expect(html).toContain("lower house");
  // judiciary facts
  expect(html).toContain("Judicial review");
  expect(html).toContain("Supreme Court");
  // federal facts
  expect(html).toContain("states");
  expect(html).toContain("self-rule 62/100");
  // election facts
  expect(html).toContain("electoral-college");
});

test("SSR fallback lists every edge as source → relation → target with constitutional basis", () => {
  const html = renderToStaticMarkup(createElement(PowerFlow, { structure }));
  expect(html).toContain("pf-fallback-edges");
  for (const e of structure.powerFlow) {
    expect(html).toContain(e.relation);
  }
  // constitutional basis text + origin, coded vs archetype-default
  expect(html).toContain("Article 85(2)(b)");
  expect(html).toContain("constitution-coded");
  expect(html).toContain("archetype-default");
  // per-edge basis source link
  expect(html).toContain("https://example.org/constitution/art85");
});

test("SSR fallback renders the relation legend for present relations only", () => {
  const html = renderToStaticMarkup(createElement(PowerFlow, { structure }));
  expect(html).toContain("Relation legend");
  // present relations glossed
  expect(html).toContain("can dissolve");
  expect(html).toContain("holds the confidence of");
  expect(html).toContain("reviews constitutionality");
});

test("SSR fallback exposes provenance / source links for EVERY provenance-bearing group", () => {
  const html = renderToStaticMarkup(createElement(PowerFlow, { structure }));
  expect(html).toContain("pf-source-link");
  expect(html).toContain("https://example.org/ccp/method");
  // system-type, chambers, judiciary, federal tiers, election systems, edges
  expect(html).toContain("ipu-parline"); // chambers + institutions
  expect(html).toContain("https://example.org/rai/datum"); // federal tier
  expect(html).toContain("idea-esd"); // election systems
  expect(html).toContain("archetype"); // an edge's provenance sourceId
  expect(html).toContain("Judiciary"); // judiciary source row present
});

test("SSR fallback surfaces BOTH system-type and field divergence notes", () => {
  const html = renderToStaticMarkup(createElement(PowerFlow, { structure }));
  expect(html).toContain("Divergence notes");
  expect(html).toContain("REIGN codes a semi-presidential variant");
  expect(html).toContain("Wikidata lists 545 Lok Sabha seats");
});

test("SSR renders the caption in .mdx-caption when provided", () => {
  const html = renderToStaticMarkup(
    createElement(PowerFlow, { structure, caption: "How authority flows through the union government" }),
  );
  expect(html).toContain("mdx-caption");
  expect(html).toContain("How authority flows through the union government");
});

test("SSR renders without any browser API (pure react-dom/server, no hydration)", () => {
  // The render itself would throw if it touched window/document under Node.
  expect(() => renderToStaticMarkup(createElement(PowerFlow, { structure }))).not.toThrow();
});
