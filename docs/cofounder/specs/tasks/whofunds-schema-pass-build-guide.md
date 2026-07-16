# Who-Funds-Whom Raw-to-Canonical Build Guide

- Status: binding adapter contract
- Date: 2026-07-15
- Scope: Phase A8 schema pass
- Canonical schema: `FundingRelationshipSchema` in `packages/core/src/funding.ts`

Use Option A domain model. Keep `ContractSchema` unchanged. Emit one `FundingRelationship` per source disclosure. Preserve one singular, source-specific `provenance` object per relationship.

## Official source contracts

Source checks completed 2026-07-15:

- [OpenSecrets lobbying dictionary](https://dkftve4js3etk.cloudfront.net/datadictionary/Data%20Dictionary%20lob_lobbying.htm): `Uniqid`, `Registrant_raw`, `Registrant`, `Isfirm`, `Client_raw`, `Client`, `Amount`, `Year`, `Type`, `Use`.
- [Senate LDA API documentation](https://lda.senate.gov/api/redoc/v1/): `filing_uuid`, `filing_year`, `filing_period`, `filing_document_url`, `income`, `expenses`, `client`, `registrant`, `lobbying_activities`; blank fields represented as `null`.
- [Senate LDA guidance](https://www.senate.gov/legislative/resources/pdf/S1guidance.pdf): outside firms file separate quarterly report per client and report income; self-filing organizations report aggregate lobbying expenses; reported amounts follow statutory threshold and rounding semantics.

Treat source documentation plus source payload as joint adapter contract. Never derive payment claim from participant names, geography, source presence, or relationship classification alone.

## OpenSecrets mapping

### Emission gate

Emit client-to-registrant relationship only when row semantics plus `Isfirm` support outside-firm lobbying. Outside-firm direction:

```text
Client_raw / Client -> funder
Registrant_raw / Registrant -> recipient
type                  -> lobbying-retainer
```

Rows lacking supported outside-firm semantics do not prove external recipient. Keep raw disclosure available for source audit; do not force row into `FundingRelationshipSchema`.

### Raw-to-canonical table

| OpenSecrets field | Canonical target | Mapping rule |
|---|---|---|
| `Uniqid` | `id` | Use stable source-namespaced identifier, preserving one identifier per specific SOPR report: `opensecrets:${Uniqid}`. Never reuse entity-pair identifier. |
| `Client` / `Client_raw` | `funder.name` | Prefer nonempty standardized `Client`; fall back to nonempty `Client_raw`. Missing both blocks relationship emission. |
| Client registry identity | `funder.id` | Copy supported registry identifier. Omit field when absent. Never synthesize identity from normalized name. |
| Client classification | `funder.kind` | Use source or maintained registry evidence. Unknown classification maps to `other`. Name-only guess prohibited. |
| `Registrant` / `Registrant_raw` | `recipient.name` | Prefer nonempty standardized `Registrant`; fall back to nonempty `Registrant_raw`. Use only after outside-firm gate passes. |
| Registrant registry identity | `recipient.id` | Copy supported registry identifier. Omit field when absent. Never synthesize identity from normalized name. |
| Registrant classification | `recipient.kind` | Use source or maintained registry evidence. Unknown classification maps to `other`. Firm label alone does not prove specific legal form. |
| Outside-firm row semantics | `type` | Set `lobbying-retainer`. `Type` value alone must not bypass outside-firm gate. |
| `Amount` | `amount` | Present source-reported numeric lobbying amount maps to `{ disclosure: "disclosed", value: Amount, currency: "USD" }`. Missing amount maps to `{ disclosure: "undisclosed", value: null, currency: null }`. |
| `Year` | `period.start`, `period.end` | Map supported four-digit year to both fields: `{ start: "YYYY", end: "YYYY" }`. Never invent month, day, or contract duration. |
| Federal disclosure regime | `jurisdiction` | Map to `{ country: "USA", subdivision: null }`. Client state remains entity location, not relationship jurisdiction. |
| Source-reported lobbying subject | `purpose` | Copy supported source description when available. Otherwise use `null`. Never infer purpose from names or amount. |
| `Type` | `tags` or adapter gate | Decode only through official dictionary semantics. Preserve supported code as source-qualified tag when useful. Never map code directly to funding type without semantic support. |
| `Use` | `tags` or adapter filter | Apply only documented source meaning. Never treat value as amount, payment, recipient, or jurisdiction evidence. |
| Retrieval metadata | `provenance` | Build one OpenSecrets-specific `ProvenanceSchema` object. Use specific record or retrieval URL for `sourceUrl`; dictionary URL for `methodUrl`. |

`Amount` meaning depends on row role semantics: lobbying income for outside firm or lobbying expense for self-filer. Outside-firm gate establishes client-to-registrant direction. Missing `Amount` means undisclosed amount, not `0`.

Corporate versus foundation distinction belongs only in `funder.kind`. Registry-supported corporation maps to `corporation`; registry-supported foundation maps to `foundation`; unresolved organization maps to `other`. Classification never changes `funder`, `recipient`, `type`, or `amount` mapping.

## Senate LDA mapping

### External-firm filing gate

External-firm filing supports client-to-registrant lobbying relationship:

```text
client     -> funder
registrant -> recipient
type       -> lobbying-retainer
income     -> amount
```

Use `income` only. `income === null` maps to undisclosed branch. Never substitute `expenses`, `0`, threshold estimate, rounded estimate, or prior-quarter value.

### Raw-to-canonical table

| Senate LDA field | Canonical target | Mapping rule |
|---|---|---|
| `filing_uuid` | `id` | Use stable source-namespaced identifier: `senate-lda:${filing_uuid}`. Each filing remains distinct. |
| `client` | `funder` | Copy source-reported client name and supported identifier. Classify `kind` only from source or maintained registry evidence; otherwise use `other`. |
| `registrant` | `recipient` | Copy source-reported registrant name and supported identifier only for external-firm filing. Classify `kind` only from evidence; otherwise use `other`. |
| External-firm filing semantics | `type` | Set `lobbying-retainer`. Relationship denotes disclosed lobbying relationship; amount branch carries value-disclosure state. |
| `income` | `amount` | Numeric source-reported value maps to `{ disclosure: "disclosed", value: income, currency: "USD" }`. `null` maps to `{ disclosure: "undisclosed", value: null, currency: null }`. |
| `expenses` | no client-to-registrant amount mapping | Self-filer aggregate internal expense. Not evidence of payment to named external recipient. Never emit client-to-registrant retainer from `expenses` alone. |
| `filing_year` + quarterly `filing_period` | `period.start`, `period.end` | Convert official quarter to `YYYY-Qn`; use same value for both fields. Unknown or non-quarter filing period fails adapter mapping. Never invent contract dates. |
| Federal disclosure regime | `jurisdiction` | Map to `{ country: "USA", subdivision: null }`. Client state remains client location only. |
| `lobbying_activities` descriptions | `purpose` | Preserve source-reported description or descriptions without semantic rewriting. Empty or absent descriptions map to `null`. |
| `lobbying_activities` issue codes | `tags` | Preserve supported codes as source-qualified strings. Never infer unsupported policy category. Empty source codes permit `[]`. |
| `filing_document_url` | `provenance.sourceUrl` | Copy filing-specific URL. Do not replace with Senate homepage. |
| Senate LDA guidance URL | `provenance.methodUrl` | Use guidance URL for income-versus-expense and filing-semantic method citation. API documentation may support payload-shape documentation. |
| Retrieval metadata | remaining `provenance` fields | Populate configured source ID, licensing result, redistribution policy, origin, actual retrieval timestamp, and source-stated uncertainty. |

### Self-filer boundary

Self-filer `expenses` reports aggregate internal expense. Record proves expense disclosure, not transfer to named external recipient. `FundingRelationshipSchema` requires `recipient`; therefore no client-to-registrant relationship emission without separate raw recipient and payment semantics. Never assign filing organization, employee, lobbyist, Senate, or placeholder entity as recipient.

Preserve self-filer filing in source-layer record or later source-specific model. Scope remains outside Phase A8 schema pass.

## Field meanings

| Field | Meaning | Exact schema contract |
|---|---|---|
| `id` | Source-disclosure identity | Required nonempty string. One ID per OpenSecrets report or Senate filing. |
| `funder.id` | Optional source or registry entity identity | Optional string. Current schema permits empty string; adapter omits field when identity absent. |
| `funder.name` | Source-grounded funding-side participant | Required string, minimum length `1`. |
| `funder.kind` | Participant classification | `corporation`, `foundation`, `government`, `ngo`, `individual`, `multilateral-institution`, or `other`. |
| `recipient.id` | Optional source or registry entity identity | Optional string. Current schema permits empty string; adapter omits field when identity absent. |
| `recipient.name` | Source-grounded receiving-side participant | Required string, minimum length `1`. |
| `recipient.kind` | Participant classification | Same enum as `funder.kind`. |
| `type` | Relationship semantics | `grant`, `donation`, `investment`, `lobbying-retainer`, `sponsorship`, or `other`. OpenSecrets outside-firm and Senate external-firm mappings use `lobbying-retainer`. |
| `amount` | Disclosure state plus supported value | Discriminated union on `disclosure`. Never use nullable value inside disclosed branch. |
| `period.start` | Earliest source-supported period | `PeriodSchema` value. |
| `period.end` | Latest source-supported period | `PeriodSchema` value. |
| `jurisdiction.country` | Relationship filing or governing jurisdiction | Required uppercase alpha-3 country-code form. |
| `jurisdiction.subdivision` | Source-supported subnational relationship jurisdiction | Required key; nonempty string or `null`. Never substitute entity location. |
| `purpose` | Source-reported relationship purpose | Required key; string or `null`. Current schema permits empty string; adapter uses `null` for absence. |
| `tags` | Source-grounded codes or controlled labels | Required string array. Empty array valid. Current schema permits empty tag strings; adapter omits empty tags. |
| `provenance` | Singular disclosure-specific evidence record | Required `ProvenanceSchema` object. Never array, aggregate, or inherited entity provenance. |

### Amount branches

```ts
type DisclosedFundingAmount = {
  disclosure: "disclosed";
  value: number; // nonnegative
  currency: string; // /^[A-Z]{3}$/
};

type UndisclosedFundingAmount = {
  disclosure: "undisclosed";
  value: null;
  currency: null;
};
```

`USD` comes from documented OpenSecrets or Senate federal disclosure regime contract, not row-level currency inference. Raw rows listed above carry no currency field. Adapter configuration must pin source contract supporting `USD`. Never infer currency from `country`, client address, registrant address, name, or amount formatting.

Explicit source-reported `0` may map to disclosed `0` only when source semantics identify value as genuine disclosed amount. Missing, blank, `null`, withheld, threshold-only, or unparsable value never becomes fake `0`. Present unparsable value produces adapter error; it does not become undisclosed silently.

### Period values

Accepted `PeriodSchema` forms:

- `YYYY`
- `YYYY-Qn`, where `n` ranges from `1` through `4`
- `YYYY-MM`, where month ranges from `01` through `12`
- `YYYY-MM-DD`, where day lexical range runs from `01` through `31`

Same-grain reversed ranges fail validation. Examples: `2025` to `2024`, `2025-Q4` to `2025-Q1`, `2025-12` to `2025-01`, `2025-12-31` to `2025-01-01`.

Mixed-grain ranges pass current schema because safe lexical comparison remains unavailable. Adapters still map only source-supported grains. OpenSecrets `Year` maps same year at both endpoints. Senate quarterly filing maps same quarter at both endpoints. Multiple annual or quarterly filings never become synthetic multi-year relationship. Future source carrying explicit multi-year start and end may populate range without aggregation.

### Provenance fields

| Field | Adapter requirement |
|---|---|
| `sourceId` | Configured `WorldSourceEntry.id`; string required. |
| `sourceUrl` | Specific record, filing document, or API retrieval URL; valid URL required. |
| `methodUrl` | Specific official dictionary, API method, or filing guidance URL; valid URL required. |
| `licenseTier` | Source-review result: `redistribute-raw-ok` or `derived-only`. Never infer from row. |
| `redistribution` | `true` only when raw provider value redistributed as-is and license permits. |
| `origin` | `referenced` for copied published claim; `computed` for khazana-derived claim. |
| `retrievedAt` | Actual ISO datetime for retrieval. Never filing date or invented midnight. |
| `uncertainty` | Required `UncertaintySchema` branch. Use `{ kind: "none" }` when source states no error measure; value does not mean certainty. |

`derived-only` provenance rejects `redistribution: true` and rejects `origin: "referenced"`. One raw filing produces one relationship with one provenance object. Later entity resolution may reuse entity IDs; later aggregation must retain disclosure-level records and provenance.

## Validation rules

- Parse complete relationship through `FundingRelationshipSchema` before persistence.
- Require nonempty `id`, `funder.name`, and `recipient.name`.
- Require entity kind from exact enum.
- Require relationship type from exact enum.
- Require disclosed amount as nonnegative number plus currency matching `/^[A-Z]{3}$/`.
- Require undisclosed amount as `value: null` plus `currency: null`.
- Reject mixed amount branches such as `disclosure: "undisclosed"` with numeric value.
- Validate currency shape only. Current schema does not verify live ISO-4217 registry membership.
- Require country matching `/^[A-Z]{3}$/`. Current schema checks uppercase alpha-3 form, not live ISO 3166-1 membership.
- Require `subdivision` key with nonempty string or `null`.
- Require valid `PeriodSchema` strings and reject reversed same-grain range.
- Require `purpose` key with string or `null`.
- Require `tags` string array.
- Require singular valid `ProvenanceSchema`; missing provenance fails parse.
- Preserve source-specific licensing constraints during provenance parse.

## USA v1 mapping

Federal OpenSecrets and Senate LDA disclosures map relationship jurisdiction exactly:

```json
{
  "country": "USA",
  "subdivision": null
}
```

Client state, registrant state, headquarters, incorporation state, address, or office location describes entity location. None establishes relationship subdivision. Do not copy location into `jurisdiction.subdivision`.

Use `USD` only from documented federal source/regime contract. Currency assignment remains adapter configuration backed by official methodology, not row inference.

USA v1 covers federal disclosure mappings only. No state-lobbying assumption, state-code normalization, or subnational jurisdiction inference enters core schema.

## No-imputation rules

- No fake `0`. Missing OpenSecrets `Amount` or Senate `income === null` maps undisclosed branch.
- No expense-to-payment conversion. Senate self-filer `expenses` remains aggregate internal expense.
- No placeholder recipient. Unsupported recipient semantics block relationship emission.
- No invented datetime. Map only source year or quarter into `PeriodSchema`.
- No synthetic multi-year range. Keep each annual or quarterly disclosure separate.
- No cross-filing collapse. Comparable OpenSecrets and Senate records remain distinct relationships.
- No provenance merge. Every disclosure retains singular source-specific provenance.
- No entity-pair ID. Relationship identity follows source disclosure.
- No name-only kind claim. Source or registry evidence required; unknown maps `other`.
- No kind-driven payment claim. Corporation, foundation, NGO, government, individual, or multilateral classification never changes amount evidence.
- No client-state jurisdiction. USA federal mapping uses `subdivision: null`.
- No row-based currency guess. `USD` comes from documented source/regime contract.
- No inferred purpose. Missing source purpose maps `null`.
- No undocumented `Type`, `Use`, or activity-code interpretation.
- No threshold backfill, rounding reversal, prior-period carry, or annualization.

## Future non-US, NGO, and multilateral expansion

### non-US sources

- Set `jurisdiction.country` from relationship filing or governing jurisdiction using uppercase ISO 3166-1 alpha-3 form.
- Set `jurisdiction.subdivision` only from source-supported relationship jurisdiction. Entity address still insufficient.
- Map source-native year, quarter, month, or day only when `PeriodSchema` preserves meaning.
- Map currency from explicit raw field or documented source/regime contract. Never default future records to `USD`.
- Keep every source disclosure distinct with source-specific provenance and licensing posture.

### NGO and foundation sources

- Use `ngo` or `foundation` only when source or maintained registry supports classification.
- Use `grant`, `donation`, `sponsorship`, `investment`, or `other` only when raw relationship semantics support value.
- Preserve disclosed versus undisclosed amount distinction.
- Keep grant period, award period, or reporting period semantics distinct; never relabel filing year as contract duration.

### multilateral sources

- Use `multilateral-institution` for supported participant classification.
- Derive jurisdiction from funding instrument or reporting regime, not institution headquarters by default.
- Preserve source-reported currencies; no forced conversion. Converted analytical values require separate computed provenance and must not overwrite source amount.
- Add relationship types only through future funding-domain decision. Never bend procurement vocabulary.

Future adapters may add entity-resolution links, richer identifiers, taxonomy entries, or aggregation views. Core rule remains stable: source-grounded roles, explicit disclosure state, supported period, relationship jurisdiction, and one provenance object per source disclosure.
