# Who-Funds-Whom Schema Decision: Option A

- Status: accepted, binding
- Date: 2026-07-15
- Scope: Phase A8 Who-Funds-Whom schema prerequisite
- Owner: `@khazana/core`
- Build target: `packages/core/src/funding.ts`

## Binding choice

Option A selected: new `FundingRelationshipSchema` in `packages/core/src/funding.ts`.

Option B rejected: no bending `ContractSchema` semantics around funding or patronage.

Task 2 must preserve `ContractSchema` unchanged. Procurement keeps buyer/supplier roles, mandatory value, single datetime, procurement method, procurement lifecycle, country, and provenance. Funding receives domain-owned contract. Pattern follows `packages/core/src/world-theater.ts`: domain module consumes shared `CountryCodeSchema`, `PeriodSchema`, and `ProvenanceSchema` unchanged.

## Decision drivers

Funding describes capital, influence, patronage, or support. Procurement describes purchase commitment. Shared money, entity, jurisdiction, and provenance concepts do not make domains equivalent.

Required source fidelity:

- OpenSecrets disclosure preserved without invented payment claim.
- Senate LDA filing preserved without invented payment date.
- Undisclosed amount represented explicitly, never fake `0`.
- Multi-year relationship represented through start/end period.
- Corporate, foundation, government, NGO, individual, and multilateral participants represented without buyer/supplier fiction.
- Lobbying relationship represented as `lobbying-retainer`, not procurement method.
- One source disclosure represented as one relationship with one source-specific `ProvenanceSchema` object.

## Option A versus Option B

| Criterion | Option A: new `FundingRelationshipSchema` | Option B: bend `ContractSchema` |
|---|---|---|
| Domain meaning | Funding/patronage contract | Procurement contract carrying non-procurement records |
| Participant roles | Role-neutral `funder` and `recipient` | False `buyer` and `supplier` labels |
| Amount state | Disclosed branch or explicit undisclosed branch | Mandatory contract value forces fake `0`, nullable mutation, or optionality |
| Time model | `period.start` and `period.end` through `PeriodSchema` | Single `date` forces invented datetime or lossy collapse |
| Relationship meaning | `grant`, `donation`, `investment`, `lobbying-retainer`, `sponsorship`, `other` | Procurement `method` overloaded with unrelated semantics |
| Lifecycle | Funding-specific relationship type plus period | `planned`, `active`, `complete`, `cancelled` becomes misleading filing lifecycle |
| Jurisdiction | Required global object: country plus nullable subdivision | Single country field cannot retain subnational filing context cleanly |
| Provenance | One disclosure, one relationship, one provenance object | Contract normalization invites cross-source collapse |
| Existing API | `ContractSchema` callers remain stable | Contract type widens; every caller must handle funding branches |
| Validation | Funding rules localized | Conditional validation spreads across contract fields |
| Near-term code cost | New schema, tests, export, decision, guide | Smaller apparent schema diff |
| Long-term code cost | Domain changes stay inside funding module | Branching, migrations, compatibility checks, UI guards |
| Future reach | Non-US, NGO, multilateral, new source support | Procurement vocabulary constrains expansion |

## schema purity versus code cost

schema purity favors Option A. Each parse result carries one honest domain claim. `ContractSchema.parse()` continues to mean procurement record. `FundingRelationshipSchema.parse()` means source-grounded funding or patronage relationship.

Option A carries higher immediate code cost: new module, tests, root export, decision record, build guide. Cost remains explicit and bounded.

Option B carries lower apparent startup cost, then higher system cost. Supporting undisclosed values requires weakening mandatory contract value. Supporting periods requires parallel date shapes. Supporting neutral roles requires aliases or unions. Supporting lobbying retainers requires overloading procurement method. Each exception reduces static guarantees for existing contract consumers.

Net choice: preserve schema purity; accept bounded new-code cost. Avoid distributed compatibility cost and permanent semantic debt.

## localization analysis

Option A localizes funding invariants in `packages/core/src/funding.ts`. Tests localize source-shaped examples and edge cases in `packages/core/src/funding.test.ts`. Public exposure requires root re-export in `packages/core/src/index.ts` plus assertion in `packages/core/src/index.test.ts`. Shared Spine schemas remain unchanged.

Option B localizes nothing. Changes begin in `packages/core/src/world-contract.ts`, then propagate into contract tests, downstream consumers, source mapping, rendering assumptions, and future migrations. Every contract reader gains obligation to distinguish procurement from patronage.

Option A change surface:

- `packages/core/src/funding.ts`
- `packages/core/src/funding.test.ts`
- `packages/core/src/index.ts`
- `packages/core/src/index.test.ts`
- decision and build-guide documents

Protected surface:

- `ContractSchema`
- `WorldEvent`
- Theater schemas
- ingest
- UI

## Binding Task 2 contract

Task 2 must export inferred public types: `FundingEntity`, `FundingJurisdiction`, `FundingAmount`, `FundingRelationshipType`, and `FundingRelationship`. No hand-duplicated TypeScript types.

Required shapes and invariants:

- `FundingEntity`: optional `id`; nonempty `name`; `kind` from `corporation`, `foundation`, `government`, `ngo`, `individual`, `multilateral-institution`, `other`.
- `FundingJurisdiction`: required `country` using `CountryCodeSchema`; required nullable, nonempty-when-present `subdivision`; no US-only `state` assumption.
- `FundingAmount`: discriminated by `disclosure`; disclosed branch uses nonnegative numeric `value` plus uppercase ISO-4217 alpha-3 `currency`; undisclosed branch uses `value: null` plus `currency: null`.
- `FundingRelationshipType`: `grant`, `donation`, `investment`, `lobbying-retainer`, `sponsorship`, `other`.
- `FundingRelationship`: nonempty `id`; `funder`; `recipient`; `type`; `amount`; `period`; `jurisdiction`; `purpose`; `tags`; singular `provenance`.
- `period.start` and `period.end`: shared `PeriodSchema`. Same-grain reversed ranges rejected. Mixed-grain ranges accepted because lexical order lacks safe comparability.
- `purpose`: required nullable string. Source absence stays `null`; no inference.
- `tags`: string array. No required synthetic tag.
- `provenance`: required singular `ProvenanceSchema`. No provenance array, merge, or inherited aggregate provenance.

## Disclosure identity and provenance

Canonical relationship identity follows source disclosure, not resolved real-world entity pair. OpenSecrets record and Senate LDA filing describing comparable parties remain separate relationships. Each retains own source URL, retrieval timestamp, origin, licensing posture, and uncertainty.

Later aggregation may deduplicate entity identities. Aggregation must not collapse source disclosures or replace distinct provenance objects with synthetic combined provenance.

No-imputation rules:

- Missing or undisclosed amount stays undisclosed; never `0`.
- Filing year or filing period maps only to supported `PeriodSchema` value; never invented datetime.
- Raw registrant/client roles map only when source semantics support mapping.
- `lobbying-retainer` does not assert payment unless raw amount field supports disclosed value.
- Missing purpose stays `null`.
- Missing subdivision stays `null`.

## Acknowledged trade-offs

- New public schema increases maintenance surface.
- Parallel entity shapes may overlap future shared entity model.
- Source-preserving rows may duplicate funder/recipient pairs.
- `other` kinds reduce taxonomy precision for uncommon cases.
- Nullable purpose and subdivision move some completeness checks into source-quality reporting.
- Mixed-grain range acceptance avoids unsafe ordering claim but permits semantically awkward pairs.
- Uppercase alpha-3 currency validation checks ISO-4217 form, not live registry membership.

Trade-offs accepted. Source fidelity, honest parse semantics, and localized evolution carry greater value.

## Rejected Option B consequences

Option B would weaken `ContractSchema` for every procurement record. Mandatory value could no longer signal disclosed procurement amount. Single `date` could no longer remain universal. Buyer/supplier names would stop carrying stable role meaning. Procurement method and status would become mixed-domain buckets.

Downstream exhaustiveness would decline. Contract views would need funding guards. Procurement tests would need funding exceptions. Future changes for donation, investment, lobbying, or sponsorship would reopen shared contract code. Existing consumers could accept structurally valid but semantically false records.

Option B also creates migration pressure. Restoring clean separation later would require identifying funding records inside mixed contract stores, translating overloaded fields, recovering lost period detail, and repairing provenance collapse. Missing raw facts could not be reconstructed.

## Future extensibility

Option A supports future non-US sources through ISO 3166-1 alpha-3 country plus source-reported subdivision. No US state vocabulary embedded in core shape.

Role-neutral entity kinds already cover NGO and multilateral institution relationships. `other` provides controlled landing zone for unsupported legal forms without procurement distortion. Future taxonomy revision can remain funding-domain work.

Relationship type expansion remains funding-domain work. Currency semantics, richer entity identifiers, aggregation views, and entity-resolution links can evolve without changing procurement contracts.

Source adapters remain future work. OpenSecrets and Senate LDA fixtures validate mapping boundaries now; later official samples may refine adapters without changing binding domain split.

## Scope boundary

Decision authorizes schema, tests, root export, decision record, and build guide only. No ingest, UI, `ContractSchema`, `WorldEvent`, or Theater edits. No source-disclosure aggregation. No entity-resolution implementation.

Option A remains binding unless later architecture decision explicitly supersedes this record.
