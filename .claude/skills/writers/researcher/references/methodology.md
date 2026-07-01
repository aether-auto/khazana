# Research methodology — the deep-research adaptation, in depth

This is the operational detail behind `SKILL.md`'s six phases. It adapts the
deep-research harness (orchestrator → parallel researchers → appraisal tiers →
triangulation → convergence → cited synthesis with quality gates) to khazana's
constraints: one Claude Code Action, Sonnet for the work, Opus only for the hardest
credibility calls, free tools only (`WebSearch`, `WebFetch`, `scripts/fetch-data.py`),
and a daily $0 cron budget. We keep the *methodology* and drop the *plumbing*.

## What we took from deep-research, and what we changed

| deep-research | khazana researcher | why |
|---|---|---|
| Opus orchestrator + parallel Sonnet researcher sub-agents, file-based comms | One Action; you run the loop yourself, Sonnet for work, Opus only for the hardest credibility calls | $0/subscription; no session-dir machinery |
| Gemini/OpenRouter model routing | `WebSearch` + `WebFetch` + `fetch-data.py` only | free tools, no paid APIs |
| High/Med/Low source-quality tiers | Same three tiers, tightened to the ledger's `high`/`med`/`low` with primary-document = High | shared with the fact-check gate |
| Triangulation + agreement score (≥60% multi-source) | Claims table with per-claim corroboration; ≥60% of **load-bearing** claims ≥2 independent sources | maps to the exact gate |
| Factual integrity ≥90% claims sourced | ≥90% of claims cite a **ledger** URL | maps to the exact gate |
| k=3 consecutive stable syntheses, 5 exploration rounds | Claims-table saturation + hard cap ~2 rounds / ~12–15 sources | daily cron can't afford 5 rounds of re-synthesis |
| Contradiction precedence: official docs > OSS > blogs | primary/peer-reviewed > reputable secondary > blog/forum | academic bar, not just software docs |

## Query craft: reaching PRIMARY sources, not just coverage

The failure mode is stopping at the first readable secondary source. A thesis reaches
the original record. Concrete moves:

- **Name the primary.** If a press piece says "a new MNRAS study found…", search the
  author + venue + year and fetch the paper itself. Cite the paper (High), list the
  press piece as corroboration (Med) only if it adds something.
- **Bias queries toward primaries.** Append `arxiv`, `doi`, `filetype:pdf`, the
  dataset name, the standard number (e.g. `RFC 8446`, `IEEE 754`), the agency
  (`NASA NTRS`, `NOAA`, `SEC EDGAR`, `data.gov`), or the primary author's surname.
- **Follow citation chains.** Open a key source's reference list for upstream
  foundations; check "cited by" (Google Scholar, Semantic Scholar, ADS) for downstream
  consensus or refutation. Two independent papers agreeing is strong corroboration; a
  later paper refuting an earlier one is a conflict to surface.
- **Get the real number at its origin.** For chartable series use `fetch-data.py`
  (prints a `SOURCE:` line). For a figure that lives only in a report, quote it verbatim
  and record page/table. A number with no traceable origin never enters the ledger.

## The independence test for corroboration

"Corroborated by ≥2 independent sources" is only meaningful if the two are genuinely
independent. Count as **one** source when:

- Two outlets both reprint the same wire (AP/Reuters) story.
- A paper and the blog/press piece that merely summarises *that* paper.
- Two pages from the same publisher/author restating the same claim.
- A dataset and a chart built directly from that dataset.

Count as **two** when the origins are genuinely separate: two independent studies,
an official dataset plus an independent analysis, a first-hand account plus a
contemporaneous record. When in doubt, treat as one — under-counting is safe, the
gate wants *real* corroboration.

## Surfacing conflict honestly

When sources disagree, the thesis move is to *show the disagreement*, not to launder it
into one confident number. In the claims table, list both supports and note the
conflict; in the dossier, tell the writer how to present it:

- Divergent numbers → give the range and attribute ("estimates range from X to Y").
- Contested causation → attribute each position ("A argues…; B disputes…").
- Precedence when you must lean one way: **primary/peer-reviewed > reputable secondary
  > blog/forum**, and say *why* (venue, recency, corroboration), rather than silently
  choosing.

## Artifact shapes (worked examples)

### Citation ledger
Exact shape (ordered High → Med → Low):
```json
[
  { "url": "https://ui.adsabs.harvard.edu/abs/1859MNRAS..20...13C/abstract",
    "title": "Carrington, R. C. (1859). A Singular Appearance seen in the Sun. MNRAS 20, 13–15.",
    "tier": "high", "origin": "researched", "firstSeen": "2026-07-01" },
  { "url": "https://en.wikipedia.org/wiki/Carrington_Event",
    "title": "Carrington Event — Wikipedia (transit time, Dst range, aurora latitudes).",
    "tier": "med", "origin": "curated", "firstSeen": "2026-07-01" }
]
```
- `origin: "curated"` for a seed FeedItem, `"researched"` for a discovery.
- Every URL a writer may cite (frontmatter `sources[]` and inline `<Annotation>`) must
  appear here. The grounding gate is: cited URL ∈ ledger.

### Claims table (Markdown)
```
| # | claim | load-bearing | supporting ledger URLs | tier(s) | corroborated | notes |
|---|-------|:-----------:|------------------------|---------|:------------:|-------|
| 1 | The flare-to-storm transit was ~17.6 h | yes | tsurutani-2003; wikipedia-carrington | high, med | yes | two independent origins (paper + encyclopedia citing different records) |
| 2 | Carrington logged the flare at 11h18m GMT, gone by 11h23m | yes | mnras-1859 | high | no | single primary; attribute to Carrington's own account — acceptable as first-hand primary, flagged for the writer |
| 3 | Telegraph lines threw sparks across N. America | yes | prescott-1860; ntrs-green-boardsen | high, high | yes | contemporaneous dispatches + NASA transcription of period newspapers |
| 4 | A modern Carrington-scale event: ~$0.6–2.6T damage | yes | lloyds-2013; nrc-2008 | med, high | yes | two independent risk assessments; RANGE — writer must give the range, not a point |
```
- **Load-bearing single-primary** (row 2) is acceptable *only* when the single source is
  the authoritative first-hand primary and the writer attributes it explicitly. Prefer
  to still find a second independent record; if none exists, this counts against the
  60% corroboration budget — keep the load-bearing set mostly ≥2-source.
- A **RANGE** claim (row 4) is corroborated *and* conflicting — the writer presents the
  range, never a false-precision midpoint.

### Research dossier (free text)
Organise by research question. Per question: the answer, the sources that support it
(with tiers), agreements, conflicts surfaced, and any gap left open. Close with a
one-line **gate report** — `claims: N · cited: X% · load-bearing corroborated: Y% ·
sources: H high / M med / L low` — the same line printed as `RESEARCH DONE`.

## Gate arithmetic (so you know when to stop)

- **Coverage** = (claims citing ≥1 ledger URL) / (total claims) ≥ **0.90**. Uncited
  claims are researched or cut — there is no third option.
- **Corroboration** = (load-bearing claims with ≥2 independent supports) / (load-bearing
  claims) ≥ **0.60**. Aim higher; 0.60 is the floor, not the target.
- If at the budget cap either is unmet, emit `RESEARCH THIN` with the specific shortfall
  and let the writer scope the piece down to what is fully grounded. Never fabricate a
  source or a corroboration to move the number — a thin honest piece passes; a padded
  fabricated one fails the adversarial fact-check and betrays the founder's rule.
