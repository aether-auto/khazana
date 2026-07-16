import { expect, test } from "vitest";
import {
  FundingAmountSchema,
  FundingEntitySchema,
  FundingJurisdictionSchema,
  FundingRelationshipSchema,
  FundingRelationshipTypeSchema,
  type FundingAmount,
  type FundingEntity,
  type FundingJurisdiction,
  type FundingRelationship,
  type FundingRelationshipType,
} from "./funding.js";

const sourceProvenance = (sourceId: string, sourceUrl: string) => ({
  sourceId,
  sourceUrl,
  methodUrl: "https://example.org/method",
  licenseTier: "redistribute-raw-ok" as const,
  redistribution: true,
  origin: "referenced" as const,
  retrievedAt: "2026-07-15T12:00:00.000Z",
  uncertainty: { kind: "none" as const },
});

const corporateFunder: FundingEntity = {
  id: "entity:client",
  name: "Example Industries",
  kind: "corporation",
};

const foundationFunder: FundingEntity = {
  id: "entity:foundation",
  name: "Example Foundation",
  kind: "foundation",
};

const usaJurisdiction: FundingJurisdiction = {
  country: "USA",
  subdivision: null,
};

const disclosedAmount: FundingAmount = {
  disclosure: "disclosed",
  value: 125_000,
  currency: "USD",
};

const relationshipTypes: FundingRelationshipType[] = [
  "grant",
  "donation",
  "investment",
  "lobbying-retainer",
  "sponsorship",
  "other",
];

const baseRelationship: FundingRelationship = {
  id: "funding:example",
  funder: corporateFunder,
  recipient: { name: "Example Recipient", kind: "ngo" },
  type: "grant",
  amount: disclosedAmount,
  period: { start: "2024", end: "2024" },
  jurisdiction: usaJurisdiction,
  purpose: null,
  tags: [],
  provenance: sourceProvenance("example-source", "https://example.org/record"),
};

const relationship = (overrides: Partial<FundingRelationship> = {}): FundingRelationship => ({
  ...baseRelationship,
  ...overrides,
});

test("OpenSecrets fields map into source-bound relationship", () => {
  const raw = {
    Uniqid: "OS-2024-001",
    Registrant_raw: "Example Advocacy LLC",
    Registrant: "EXAMPLE ADVOCACY LLC",
    Isfirm: "Y",
    Client_raw: "Example Industries, Inc.",
    Client: "EXAMPLE INDUSTRIES INC",
    Amount: 125_000,
    Year: 2024,
    Type: "C",
  };

  const canonical: FundingRelationship = {
    id: `opensecrets:${raw.Uniqid}`,
    funder: { name: raw.Client_raw, kind: "corporation" },
    recipient: { name: raw.Registrant_raw, kind: "corporation" },
    type: "lobbying-retainer",
    amount: { disclosure: "disclosed", value: raw.Amount, currency: "USD" },
    period: { start: String(raw.Year), end: String(raw.Year) },
    jurisdiction: { country: "USA", subdivision: null },
    purpose: null,
    tags: ["opensecrets", raw.Type],
    provenance: sourceProvenance(
      "opensecrets-lobbying",
      `https://www.opensecrets.org/federal-lobbying/summary?uniqid=${raw.Uniqid}`,
    ),
  };

  expect(FundingRelationshipSchema.parse(canonical)).toEqual(canonical);
});

test("Senate LDA fields map into lobbying-retainer relationship", () => {
  const raw = {
    filing_uuid: "11111111-2222-3333-4444-555555555555",
    filing_year: 2023,
    filing_period: "first_quarter",
    filing_document_url: "https://lda.senate.gov/filings/public/filing/11111111-2222-3333-4444-555555555555/print/",
    income: "95000.00",
    expenses: null,
    client: { name: "Example Energy Corporation" },
    registrant: { name: "Example Public Affairs LLC" },
    lobbying_activities: [{ general_issue_code: "ENG", description: "Energy policy" }],
  };

  const canonical: FundingRelationship = {
    id: `senate-lda:${raw.filing_uuid}`,
    funder: { name: raw.client.name, kind: "corporation" },
    recipient: { name: raw.registrant.name, kind: "corporation" },
    type: "lobbying-retainer",
    amount: { disclosure: "disclosed", value: Number(raw.income), currency: "USD" },
    period: { start: String(raw.filing_year), end: String(raw.filing_year) },
    jurisdiction: { country: "USA", subdivision: null },
    purpose: raw.lobbying_activities.map((activity) => activity.description).join("; "),
    tags: ["senate-lda", raw.filing_period, raw.lobbying_activities[0]!.general_issue_code],
    provenance: sourceProvenance("senate-lda", raw.filing_document_url),
  };

  const parsed = FundingRelationshipSchema.parse(canonical);
  expect(parsed.type).toBe("lobbying-retainer");
  expect(parsed.amount).toEqual({ disclosure: "disclosed", value: 95_000, currency: "USD" });
});

test("undisclosed amount keeps null values", () => {
  const amount: FundingAmount = { disclosure: "undisclosed", value: null, currency: null };
  expect(FundingAmountSchema.parse(amount)).toEqual(amount);
  expect(
    FundingAmountSchema.safeParse({ disclosure: "undisclosed", value: 0, currency: null }).success,
  ).toBe(false);
});

test("multi-year period parses", () => {
  const parsed = FundingRelationshipSchema.parse(
    relationship({ period: { start: "2021", end: "2024" } }),
  );
  expect(parsed.period).toEqual({ start: "2021", end: "2024" });
});

test("corporation and foundation funders stay distinct", () => {
  expect(FundingRelationshipSchema.parse(relationship()).funder.kind).toBe("corporation");
  expect(
    FundingRelationshipSchema.parse(
      relationship({ id: "funding:foundation", funder: foundationFunder, type: "donation" }),
    ).funder.kind,
  ).toBe("foundation");
});

test("every entity kind parses", () => {
  const kinds: FundingEntity["kind"][] = [
    "corporation",
    "foundation",
    "government",
    "ngo",
    "individual",
    "multilateral-institution",
    "other",
  ];

  for (const kind of kinds) {
    expect(FundingEntitySchema.parse({ name: "Entity", kind }).kind).toBe(kind);
  }
});

test("every relationship type parses", () => {
  for (const type of relationshipTypes) {
    expect(FundingRelationshipTypeSchema.parse(type)).toBe(type);
    expect(FundingRelationshipSchema.parse(relationship({ type })).type).toBe(type);
  }
});

test.each(["usd", "US", "USDD", "12D"])("currency %s rejected", (currency) => {
  expect(
    FundingAmountSchema.safeParse({ disclosure: "disclosed", value: 1, currency }).success,
  ).toBe(false);
});

test("negative disclosed amount rejected", () => {
  expect(
    FundingAmountSchema.safeParse({ disclosure: "disclosed", value: -1, currency: "USD" }).success,
  ).toBe(false);
});

test("invalid jurisdiction rejected", () => {
  expect(FundingJurisdictionSchema.safeParse({ country: "us", subdivision: null }).success).toBe(
    false,
  );
  expect(FundingJurisdictionSchema.safeParse({ country: "USA", subdivision: "" }).success).toBe(
    false,
  );
});

test.each([
  [{ start: "2025", end: "2024" }],
  [{ start: "2025-Q2", end: "2025-Q1" }],
  [{ start: "2025-02", end: "2025-01" }],
  [{ start: "2025-01-02", end: "2025-01-01" }],
])("reversed comparable period %j rejected", (period) => {
  expect(FundingRelationshipSchema.safeParse(relationship({ period })).success).toBe(false);
});

test("mixed-grain reversed-looking period accepted", () => {
  const period = { start: "2025", end: "2024-Q4" };
  expect(FundingRelationshipSchema.parse(relationship({ period })).period).toEqual(period);
});

test("missing provenance rejected", () => {
  const input: Record<string, unknown> = { ...relationship() };
  delete input.provenance;
  expect(FundingRelationshipSchema.safeParse(input).success).toBe(false);
});

test("empty entity name and relationship id rejected", () => {
  expect(FundingEntitySchema.safeParse({ name: "", kind: "ngo" }).success).toBe(false);
  expect(FundingRelationshipSchema.safeParse(relationship({ id: "" })).success).toBe(false);
});
