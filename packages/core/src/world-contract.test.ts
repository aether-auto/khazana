import { expect, test } from "vitest";
import { ContractSchema } from "./world-contract.js";

const derivedProvenance = {
  sourceId: "acled",
  sourceUrl: "https://acleddata.com/api/procurement",
  methodUrl: "https://acleddata.com/methodology",
  licenseTier: "derived-only" as const,
  redistribution: false,
  origin: "computed" as const,
  retrievedAt: "2026-07-07T12:00:00.000Z",
  uncertainty: { kind: "none" as const },
};

test("round-trips a fully-populated Contract fixture with a derived-only-tier Provenance", () => {
  const full = {
    id: "ocds-abc-123",
    buyer: { name: "Ministry of Health", id: "gov-moh" },
    supplier: { name: "Acme Medical Supplies", id: "sup-42" },
    value: { amount: 1500000, currency: "USD" },
    country: "USA",
    sector: "healthcare",
    date: "2026-01-15T00:00:00.000Z",
    method: "open tender",
    status: "active" as const,
    provenance: derivedProvenance,
  };
  const parsed = ContractSchema.parse(full);
  expect(parsed).toEqual(full);
});

test("confirms buyer.id/supplier.id/sector/method/status are truly optional", () => {
  const minimal = {
    id: "ocds-min-1",
    buyer: { name: "Ministry of Health" },
    supplier: { name: "Acme Medical Supplies" },
    value: { amount: 1000, currency: "USD" },
    country: "USA",
    date: "2026-01-15T00:00:00.000Z",
    provenance: derivedProvenance,
  };
  const parsed = ContractSchema.parse(minimal);
  expect(parsed).toEqual(minimal);
});

test("rejects a malformed (2- or 4-char) currency code", () => {
  const base = {
    id: "ocds-bad-1",
    buyer: { name: "Ministry of Health" },
    supplier: { name: "Acme Medical Supplies" },
    country: "USA",
    date: "2026-01-15T00:00:00.000Z",
    provenance: derivedProvenance,
  };
  expect(() => ContractSchema.parse({ ...base, value: { amount: 1000, currency: "US" } })).toThrow();
  expect(() => ContractSchema.parse({ ...base, value: { amount: 1000, currency: "USDD" } })).toThrow();
});

test("rejects a negative value.amount", () => {
  const base = {
    id: "ocds-bad-2",
    buyer: { name: "Ministry of Health" },
    supplier: { name: "Acme Medical Supplies" },
    country: "USA",
    date: "2026-01-15T00:00:00.000Z",
    provenance: derivedProvenance,
  };
  expect(() => ContractSchema.parse({ ...base, value: { amount: -1, currency: "USD" } })).toThrow();
});

test("rejects an unknown status enum value", () => {
  const base = {
    id: "ocds-bad-3",
    buyer: { name: "Ministry of Health" },
    supplier: { name: "Acme Medical Supplies" },
    value: { amount: 1000, currency: "USD" },
    country: "USA",
    date: "2026-01-15T00:00:00.000Z",
    provenance: derivedProvenance,
  };
  expect(() => ContractSchema.parse({ ...base, status: "pending-approval" })).toThrow();
});
