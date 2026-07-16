# Who-Funds-Whom Schema Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add provenance-preserving `FundingRelationshipSchema` for OpenSecrets and Senate LDA disclosures without changing procurement contracts.

**Architecture:** New domain-owned `packages/core/src/funding.ts`. Shared `CountryCodeSchema`, `PeriodSchema`, and `ProvenanceSchema` consumed unchanged. Source adapters remain future work; tests use source-shaped raw fixtures plus explicit raw-to-canonical construction.

**Tech Stack:** TypeScript strict mode, Zod, Vitest, pnpm.

## Global Constraints

- Choose Option A. Keep `ContractSchema`, `WorldEvent`, Theater, ingest, and UI unchanged.
- Export inferred public types: `FundingEntity`, `FundingJurisdiction`, `FundingAmount`, `FundingRelationshipType`, `FundingRelationship`.
- Entity kinds: `corporation`, `foundation`, `government`, `ngo`, `individual`, `multilateral-institution`, `other`.
- Relationship kinds: `grant`, `donation`, `investment`, `lobbying-retainer`, `sponsorship`, `other`.
- Disclosed amount: nonnegative value plus uppercase ISO-4217 alpha-3 currency. Undisclosed amount: explicit `null` value and `null` currency. No fake zero.
- Relationship period: `start` and `end` through shared `PeriodSchema`. Reject reversed periods when both values share comparable grain.
- Jurisdiction: required object with ISO 3166-1 alpha-3 `country` plus nullable non-US-specific `subdivision`.
- Purpose: required nullable string. Tags: string array. Provenance: one required shared `ProvenanceSchema` object.
- One source disclosure equals one relationship. Never collapse provenance.
- English prose: caveman style. Preserve every technical term, path, command, number, and code block exactly.
- Leave `docs/assets/`, `docs/index.html`, `docs/specs.html`, and `docs/tasks.html` untouched.

---

### Task 1: Binding Design Decision

**Files:**
- Create: `docs/cofounder/specs/tasks/whofunds-schema-pass-decision.md`

**Interfaces:**
- Consumes: approved Option A rationale.
- Produces: binding architecture choice for Task 2.

- [ ] **Step 1: Write decision document**

Name Option A explicitly. Include Option A versus Option B matrix; schema-purity versus code-cost analysis; localization analysis; acknowledged trade-offs; rejected Option B consequences; future extensibility.

- [ ] **Step 2: Verify required sections**

Run:
```bash
rg -n "Option A|Option B|schema purity|code cost|localization|Binding choice|ContractSchema" docs/cofounder/specs/tasks/whofunds-schema-pass-decision.md
```

Expected: every required concept present.

---

### Task 2: Funding Schema, Tests, Root Export

**Files:**
- Create: `packages/core/src/funding.test.ts`
- Create: `packages/core/src/funding.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/index.test.ts`

**Interfaces:**
- Consumes: `CountryCodeSchema`, `PeriodSchema`, `ProvenanceSchema` unchanged.
- Produces: `FundingEntitySchema`, `FundingJurisdictionSchema`, `FundingAmountSchema`, `FundingRelationshipTypeSchema`, `FundingRelationshipSchema` plus inferred public types.

- [ ] **Step 1: Write failing tests first**

Cover OpenSecrets raw fields `Uniqid`, `Registrant_raw`, `Client_raw`, `Amount`, `Year`, `Type`; Senate LDA raw fields `filing_uuid`, `filing_year`, `filing_period`, `filing_document_url`, `income`, `expenses`, `client`, `registrant`, `lobbying_activities`; undisclosed amount; multi-year range; corporation versus foundation funder; lobbying-retainer mapping; every entity and relationship literal; malformed/lowercase currency; invalid jurisdiction; reversed same-grain range; mixed-grain acceptance; missing provenance; root export.

- [ ] **Step 2: Confirm RED**

Run:
```bash
pnpm exec vitest run packages/core/src/funding.test.ts
```

Expected: FAIL because `./funding.js` missing.

- [ ] **Step 3: Add minimal schema**

Use these exact shapes:

```ts
FundingEntitySchema = {
  id: string optional,
  name: nonempty string,
  kind: corporation | foundation | government | ngo | individual | multilateral-institution | other,
}

FundingJurisdictionSchema = {
  country: CountryCodeSchema,
  subdivision: nonempty string nullable,
}

FundingAmountSchema =
  | { disclosure: "disclosed"; value: nonnegative number; currency: uppercase alpha-3 string }
  | { disclosure: "undisclosed"; value: null; currency: null }

FundingRelationshipSchema = {
  id: nonempty string,
  funder: FundingEntitySchema,
  recipient: FundingEntitySchema,
  type: FundingRelationshipTypeSchema,
  amount: FundingAmountSchema,
  period: { start: PeriodSchema; end: PeriodSchema },
  jurisdiction: FundingJurisdictionSchema,
  purpose: string nullable,
  tags: string array,
  provenance: ProvenanceSchema,
}
```

Comparable grain: `YYYY` with `YYYY`; `YYYY-Qn` with `YYYY-Qn`; `YYYY-MM` with `YYYY-MM`; `YYYY-MM-DD` with `YYYY-MM-DD`. Lexical comparison safe only after same-grain detection.

- [ ] **Step 4: Re-export and assert root import**

Add `export * from "./funding.js";` to `packages/core/src/index.ts`. Import `FundingRelationshipSchema` from `./index.js` in `packages/core/src/index.test.ts`; assert schema exported.

- [ ] **Step 5: Confirm GREEN**

Run:
```bash
pnpm exec vitest run packages/core/src/funding.test.ts packages/core/src/index.test.ts
pnpm --filter @khazana/core typecheck
```

Expected: PASS, 0 type errors.

---

### Task 3: Raw-to-Canonical Build Guide

**Files:**
- Create: `docs/cofounder/specs/tasks/whofunds-schema-pass-build-guide.md`

**Interfaces:**
- Consumes: Task 2 exported schemas and exact field names.
- Produces: future adapter contract for OpenSecrets, Senate LDA, and later non-US sources.

- [ ] **Step 1: Write mapping guide**

Include OpenSecrets mapping table, Senate LDA mapping table, field meanings, validation rules, USA v1 mapping, no-imputation rules, source URLs, and future non-US/NGO/multilateral expansion.

- [ ] **Step 2: Preserve filing semantics**

Document: external-firm Senate `income` supports client-to-registrant `lobbying-retainer`; null amount maps `undisclosed`; self-filer `expenses` never invents external recipient; OpenSecrets `Amount` maps only when source record carries value; each filing stays separate; entity kind classification never changes payment claim.

- [ ] **Step 3: Verify required sections**

Run:
```bash
rg -n "OpenSecrets|Senate LDA|Field meanings|Validation rules|USA v1|No-imputation|non-US|NGO|multilateral" docs/cofounder/specs/tasks/whofunds-schema-pass-build-guide.md
```

Expected: every required concept present.

---

### Task 4: Full Verification and Commit

**Files:**
- Verify all scoped changes.

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: review-clean commit.

- [ ] **Step 1: Run requested focused and package checks**

Run:
```bash
pnpm -F @khazana/core test --run funding
pnpm exec vitest run packages/core/src/index.test.ts
pnpm exec vitest run packages/core
pnpm --filter @khazana/core typecheck
```

If first command fails in pnpm argument parsing because `@khazana/core` has no `test` script, record mismatch and run `pnpm exec vitest run packages/core/src/funding.test.ts` as executable equivalent.

- [ ] **Step 2: Scope audit**

Run:
```bash
git diff --name-only
git diff --check
```

Expected: only planned files plus this plan; no whitespace errors.

- [ ] **Step 3: Commit task**

```bash
git add docs/superpowers/plans/2026-07-15-whofunds-schema-pass.md packages/core/src/funding.ts packages/core/src/funding.test.ts packages/core/src/index.ts packages/core/src/index.test.ts
git add -f docs/cofounder/specs/tasks/whofunds-schema-pass-decision.md docs/cofounder/specs/tasks/whofunds-schema-pass-build-guide.md
git commit -m "feat(core): add funding relationship schema"
```
