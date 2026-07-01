---
name: writers/build-log
description: This skill should be used to author a BUILD LOG post for khazana — a DIY/project walkthrough a maker can reproduce, with a parts list, numbered steps, runnable code, and an honest "what went wrong" section. Trigger when a brief's "Format:" line is `build-log`, or when asked to "write a build log", "walk through building X", or produce a reproducible project-build MDX post. Produces one MDX file (RunnableCode/DataTable/Annotation; optionally StatBand/Pullquote where earned) targeting ~15-min rendered depth that builds in apps/site and passes validateDraft.
version: 1.0.0
---

# Build Log writer

Author one **build-log** post: a DIY/project walkthrough in the tradition of
Adafruit tutorials, Hackaday project logs, Bunnie Huang, and Jeff Geerling. Written
for a maker who wants to *reproduce the build*. Specific: part numbers, exact
commands, real URLs. Honest about what went wrong and how it was fixed — that
section is the most valuable part. Steps are numbered and completable in order.

Input is an authoring brief on stdin: title, slug, channel, founder voice, and the
**curated cluster** — the real seed article(s)/docs/datasheets. The verifiable source
of truth is the **citation ledger** the research phase builds out from that cluster
(ideally to the datasheet, official docs, or vendor spec). Output is one MDX file at
the brief's path.

## Grounding mandate (non-negotiable)

A build log's value is reproducibility, which demands accuracy:

- Every part (name, source, price), command, pin, and parameter traces to a **citation-
  ledger source** (a datasheet, the project's own writeup, an official docs page — see
  `writers/researcher`) and is cited — the parts list links sources via `<Annotation>`
  or the `<DataTable>` rows, and key commands/decisions cite their source. Prefer the
  **primary datasheet / official docs** the research surfaced over a forum retelling.
- **Load-bearing specifics** — the exact part number, the pin mapping, the command that
  makes or breaks the build — should rest on a **High-tier primary** (datasheet /
  official docs) and be **corroborated by a second independent ledger source** where
  the stakes are high (a wrong part wastes money; a wrong command wastes an afternoon).
- **Do not invent part numbers, prices, commands, or error messages.** If a specific
  is not in a ledger source, cut it or mark `[UNSUPPORTED]`.
- `<RunnableCode>` examples must be correct, self-contained JavaScript that runs
  (the worker runs JS only). For shell/config that isn't JS, use a fenced code block.
- Every cited source URL goes in `sources[]` and is cited inline — and every such URL
  is in the ledger.

Shared tier rubric, triangulation rules, and gate definitions live once in
**`writers/researcher/SKILL.md`** — referenced here, not restated.

## Craft rubric (5 imperatives)

1. **Parts list first.** A `<DataTable>` of component, quantity, source URL, and
   approximate cost — so the reader can order everything before reading on.
2. **Numbered steps.** Each step is one completable action. Combine atomic steps;
   separate independently-checkable ones.
3. **Exact commands, not paraphrases.** "Run `sudo apt install mosquitto -y`", not
   "install mosquitto". Every command in a code block.
4. **Name the failures.** The "it didn't work at first because…" section — the real
   error message and the real fix — is the most-read part of any build log.
5. **"Reproduce this" checklist at the end.** Every file, command, and config change
   in order, so the reader can diff against it when something breaks.

Full detail: **`references/craft.md`**.

## Structural template (target ~15-min rendered read / `GAUSSIAN_DEFAULTS.peakMin`)

Aim for ~2500–4000 words + code. Reach depth through more detail in build steps, a
thorough failures section, a richer reproduce-this checklist — never padding.

What we're building (100–150w) → parts + tools as a `<DataTable>` (with cited source
links) → optional `<StatBand>` if key project stats (total cost, build time, measured
output) set expectations before the build begins (earn it: only when those numbers frame
the whole project) → step-by-step (900–1500w, numbered; each step: action → expected
result → code block or `<RunnableCode>`; gotcha callouts) → optional `<Pullquote>` of a
spec line or vendor warning if verbatim is more powerful than paraphrase → what went
wrong (300–500w: real errors, real fixes) → results (150–200w: does it work? measurements)
→ "Reproduce this" checklist. Annotated skeleton: **`references/template.mdx`**. Worked
excerpts: **`references/exemplars.md`**.

## Components (this format's kit only)

`RunnableCode`, `DataTable`, `Annotation`, `StatBand`, `Pullquote` — nothing else.

**Every component must be earned.** The parts table and exact commands ARE the argument.
Reproducibility is the craft. Reach depth through more step detail, a thorough failures
section — not by adding components. A build log with only `DataTable`, `RunnableCode`,
and `Annotation` is often the strongest.

- **`<DataTable client:load>`** — parts list (and measurements table); cited source links per row.
- **`<RunnableCode client:visible>`** — runnable JS logic the reader can try. Non-JS commands (shell, YAML, C) go in plain fenced code blocks.
- **`<Annotation client:load>`** — cites part sources, datasheet values, and commands inline.
- **`<StatBand client:visible>`** — earn it when key project stats set expectations before the build begins. Props: `stats=[{ value, prefix?, suffix?, decimals?, group?, label, sub?, href? }]`, `caption?`.
- **`<Pullquote>` (static `.astro`, NO `client:` directive)** — earn it when a verbatim spec line or vendor warning is more powerful than a paraphrase. Props: `cite?`, `href?`, `kind?` (try `kind="document"` for datasheets, `kind="headline"` for a project reveal).

Exact props: **`references/mdx-contract.md`**.

## Reading-comfort & voice

Founder voice for a maker: concrete and specific; first person acceptable (you built
this); no hedging; precise part/command names; vary rhythm; don't start consecutive
sentences with "The". Be honest about failures — that candor is the format's
signature. End on the reproduce-this checklist, not a flourish.

## Authoring chain — run in strict order, tag each phase

### `<phase>Research</phase>`
**Run before Internalize. Do not draft without a populated citation ledger + claims
table.** Invoke the `writers/researcher` methodology: plan 5–8 research questions,
search out from the curated seeds to the **primary datasheets, official docs, and
vendor specs** behind the build (part numbers, pinouts, exact commands), appraise each
into the ledger with its tier, and corroborate load-bearing specifics against a second
independent source where a mistake is costly. Output the research dossier, the citation
ledger, and the claims table. If the gates can't be met at budget, take the
`RESEARCH THIN` handoff and scope down.

### `<phase>Internalize</phase>`
Read the brief and the research dossier. Output 5–10 lines: (a) what's being built, in
one sentence; (b) the parts list with each part's ledger URL (prefer the datasheet/
official docs); (c) the 2–3 steps where things genuinely went wrong (the high-value
failures) and their ledger sources; (d) which component carries the parts list vs
runnable logic. Confirm every part/command/number is a claims-table row citing a ledger
URL — load-bearing specifics corroborated. Anything not in the table → `[UNSUPPORTED]`
(research or cut). Do not write prose yet.

### `<phase>Outline</phase>`
Section-by-section against the template: the `<DataTable>` parts list, the numbered
steps (each one completable), the failures section, the reproduce-this checklist.
Confirm target ~2500–4000 words (~15-min rendered read), every command is exact,
every cited source is used, and only kit components appear. For each `<StatBand>` or
`<Pullquote>`, state in one sentence why it earns its place — if you can't, cut it.

### `<phase>Draft</phase>`
Write the parts `<DataTable>` first (cited sources). Write numbered steps with exact
commands (fenced blocks; `<RunnableCode>` for runnable JS, mentally executed). Write
the honest failures section with real error messages and fixes. Close with the
reproduce-this checklist. Cite every part/value/command. Match voice.

### `<phase>Verify + Emit</phase>`
Self-check against `references/mdx-contract.md` §5 **and the fact-check gates**: every
`sources[].url` is a **verbatim ledger URL** + non-empty; **≥90% of parts/commands/
numbers cite a ledger source** or are cut; **≥60% of load-bearing specifics corroborated
by ≥2 independent ledger sources** (check the claims table); no invented part number,
price, command, or error; `<RunnableCode>` is valid self-contained JS; only kit
components; frontmatter valid; a parts list and a reproduce-this checklist both present.
Run `python3 scripts/check-links.py <file>.mdx`. If all pass, write and print
`DONE: <slug>`. Else `FAIL: <slug> — <reason>` and do not write.

## Resources
- `writers/researcher/SKILL.md` — the research phase: literature search, tier rubric,
  triangulation, the ledger + claims-table shapes, and the fact-check gates (shared).
- `references/craft.md` — deep craft rubric (Adafruit/Hackaday technique).
- `references/template.mdx` — annotated structural skeleton.
- `references/exemplars.md` — worked exemplars and annotated patterns.
- `references/mdx-contract.md` — exact frontmatter + component contract.
- `scripts/check-links.py` — Verify-phase link validator (`--help`).
