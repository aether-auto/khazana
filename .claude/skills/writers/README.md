# khazana writer skills

Six specialized **per-format writer skills**. Each turns an authoring *brief*
(produced by `packages/generate`'s `buildBrief()`) into one publishable MDX file
in `apps/site/src/content/blog/` — a deep, genuinely educational, data-rich,
**grounded** interactive blog post in the founder's voice.

| Skill | Format | Intent | Length | Component kit |
|---|---|---|---|---|
| `writers/chronicle` | chronicle | narrate | ~1800–2500w | Scrolly, Annotation, Timeline, Map |
| `writers/dispatch` | dispatch | explain | ~1500–2000w + charts | Chart, Scrolly, DataTable, Annotation |
| `writers/teardown` | teardown | explain | ~1500–2500w + code | RunnableCode, Chart, Annotation |
| `writers/primer` | primer | explain | ~1500–2000w + sandboxes | RunnableCode, Chart, Annotation |
| `writers/field-notes` | field-notes | synthesize | ~300–500w | Annotation, DataTable |
| `writers/build-log` | build-log | build | ~1000–2000w + code | RunnableCode, DataTable, Annotation |

## The one rule above all others: GROUNDING

Every post is **grounded in one or more real, existing source article(s)** — the
verifiable source of truth supplied in the brief's "Source items" block. The
writer *enhances* massively (depth, real-data charts, interactivity, cross-source
synthesis) but **never invents an ungrounded topic, fact, number, name, date, or
quote.** Every factual claim traces to a cited source. Every `sources[].url` in
the frontmatter references a real source article from the brief. This is enforced
in each skill's **Internalize** and **Verify** phases and re-checked by the
generate pipeline's `validateDraft` + `factChecker`.

## The four-phase authoring chain (every skill)

Each skill drives the same explicit, tagged chain. Phases run in strict order and
are marked with `<phase>` tags so the verify step can confirm all four ran:

1. **`<phase>Internalize</phase>`** — read the brief; extract the single thesis,
   the 2–3 strongest data points / scenes / code examples, and which components
   carry which ideas. List every fact you intend to use *and its source id*; mark
   any unsupported fact `[UNSUPPORTED]` now.
2. **`<phase>Outline</phase>`** — section-by-section outline (heading + intent +
   component placement) against the format's structural template; confirm length
   target and that every cited source appears at least once.
3. **`<phase>Draft</phase>`** — write the full MDX. Data/diagrams arrive *before*
   the prose that explains them. Every named fact carries an inline `<Annotation>`
   or link. Match founder voice. Run `fetch-data.py` (dispatch/teardown) for real
   numbers before writing any `<Chart>`.
4. **`<phase>Verify + Emit</phase>`** — self-check the frontmatter contract,
   grounding, and component allow-list; run `check-links.py`; write the file; print
   `DONE: <slug>` (or `FAIL: <slug> — <reason>` and do not write).

## How the GitHub Action invokes a writer

The generate pipeline plans assignments and writes one brief per post. The Action
selects the matching skill by the brief's `Format:` line and pipes the brief in:

```bash
for brief in data/generation/briefs/*.md; do
  FORMAT=$(grep -m1 '^\*\*Format:\*\*' "$brief" | sed 's/.*: //' | cut -d' ' -f1)
  claude --skill "writers/$FORMAT" < "$brief"
done
pnpm generate verify   # runVerify(): validateDraft + factChecker, blocks bad drafts
```

The skill supplies *craft* (rubric, template, voice, phases); the brief supplies
the *assignment* (title, slug, channel, the real source items, the exact
frontmatter to emit). Together they produce MDX that builds in the site and passes
`validateDraft`.

## What keeps the MDX valid (the contract)

Authoritative contract: **`references/mdx-contract.md`** (one copy per skill).
Summary:

- **Frontmatter** must satisfy `apps/site/src/content.config.ts` *and*
  `packages/generate/src/validate.ts` (they mirror each other): `title`,
  `format` (exact format name), `channels` (non-empty, from the channel vocab),
  `summary`, `publishedAt` (ISO 8601), `sources` (non-empty `{title, url}`; every
  url must be a brief source), `draft: false`.
- **Components**: import from `../../components/mdx`; use *only* names in the
  allow-list (`Annotation, Chart, Timeline, DataTable, Scrolly, ScrollyStep,
  RunnableCode, Map`) — and within that, only this format's kit. Interactive
  islands need a client directive (`client:visible` or `client:load`).

## Scripts (stdlib-only, $0, no API keys)

- **`scripts/check-links.py`** (all six) — validates that every `sources[].url`
  in a finished MDX file is reachable; non-zero exit blocks a draft that cites a
  dead link. `python3 scripts/check-links.py path/to/post.mdx`.
- **`scripts/fetch-data.py`** (dispatch + teardown) — pulls real series from FRED,
  World Bank, and Our World in Data into `<Chart>`-ready JSON. On failure, the
  writer falls back to a `<DataTable>` citing numbers directly from the brief —
  never fabricated data. `python3 scripts/fetch-data.py fred UNRATE`.

## Layout

```
writers/
  README.md                  # this file
  <format>/
    SKILL.md                 # craft rubric + template + 4-phase chain + contract
    references/
      craft.md               # the format's craft imperatives, deep
      template.mdx           # annotated structural skeleton
      exemplars.md           # 2–3 worked exemplars / annotated patterns
      mdx-contract.md        # the frontmatter + component contract (shared copy)
    scripts/
      check-links.py         # (all)
      fetch-data.py          # (dispatch, teardown)
```
