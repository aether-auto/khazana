import { FORMATS, type CitationLedger, type FeedItem } from "@khazana/core";
import type { Assignment } from "./select.js";

export interface BriefResearch {
  /** Free-text research dossier: findings-by-question, appraisal notes, synthesis. */
  researchDossier?: string;
  /** Curated ∪ researched appraised sources. Every cited url MUST be in here. */
  citationLedger?: CitationLedger;
}

/**
 * Curated seed block. Inlines FULL source text (`body`) where curation captured it,
 * falling back to the summary otherwise — the writer researches outward from these.
 */
function sourceBlock(items: FeedItem[]): string {
  return items
    .map((it) => {
      const text = it.body?.trim()
        ? `  - full text:\n\n${indent(it.body.trim())}`
        : `  - summary: ${it.summary || "(no summary)"}`;
      return `- **id:** \`${it.id}\` — **${it.title}**\n` + `  - url: ${it.url}\n` + text;
    })
    .join("\n\n");
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
}

function ledgerBlock(ledger: CitationLedger): string {
  return ledger
    .map(
      (e) =>
        `- [${e.tier.toUpperCase()} · ${e.origin}] **${e.title}** — ${e.url}` +
        (e.firstSeen ? ` _(first seen ${e.firstSeen})_` : ""),
    )
    .join("\n");
}

export function buildBrief(
  assignment: Assignment,
  items: FeedItem[],
  style: string,
  research: BriefResearch = {},
): string {
  const fmt = FORMATS[assignment.format];
  const byId = new Map(items.map((it) => [it.id, it]));
  const sources = assignment.sourceItemIds
    .map((id) => byId.get(id))
    .filter((it): it is FeedItem => it !== undefined);

  const ledger = research.citationLedger ?? [];
  // Frontmatter `sources` seed: prefer the appraised ledger; else the curated seeds.
  const sourceRows = ledger.length > 0 ? ledger.map((e) => ({ url: e.url })) : sources.map((it) => ({ url: it.url }));

  const channelsYaml = [assignment.channel].map((c) => `  - ${c}`).join("\n");
  const sourcesYaml = sourceRows.map((s) => `  - { title: "<title>", url: "${s.url}" }`).join("\n");

  const dossierSection = research.researchDossier?.trim()
    ? `## Research dossier (from the \`writers/researcher\` phase)\nGround your claims against this. Expand it further with your own research where the dossier is thin.\n\n${research.researchDossier.trim()}\n`
    : `## Research dossier\n(No dossier supplied — you MUST run the \`writers/researcher\` phase first: literature search, source discovery beyond the seeds below, credibility appraisal, and triangulation, recording every appraised source into the citation ledger.)\n`;

  const ledgerSection =
    ledger.length > 0
      ? `## Citation ledger (curated ∪ researched — every cited url MUST be here)\n${ledgerBlock(ledger)}\n`
      : `## Citation ledger\n(Empty — build it during the research phase. Tiers: High = peer-reviewed/journal/arXiv/primary-document/official-standard; Med = reputable secondary (established press, official docs); Low = blog/forum, allowed only if corroborated.)\n`;

  return `# Authoring brief: ${assignment.title}

**Slug:** \`${assignment.slug}\`
**Format:** ${assignment.format} (${fmt.intent} / ${fmt.length})
**Channel:** ${assignment.channel}
**Why this assignment:** ${assignment.rationale}

## Format voice profile
${fmt.voiceProfile}

## Founder voice guide (STYLE.md)
${style.trim() || "(STYLE.md not provided)"}

## Output file
Write the MDX to: \`apps/site/src/content/blog/${assignment.slug}.mdx\`

## EXACT frontmatter to emit
The frontmatter MUST validate against the site's blog content collection. Emit YAML with EXACTLY these fields:

\`\`\`yaml
---
title: "${assignment.title}"
format: ${assignment.format}
channels:
${channelsYaml}
summary: "<one-sentence summary>"
publishedAt: ${"<ISO 8601 datetime, e.g. the run date>"}
sources:
${sourcesYaml || '  - { title: "<title>", url: "<url>" }'}
draft: false
---
\`\`\`

- \`format\` MUST be exactly \`${assignment.format}\`.
- \`channels\` MUST be a non-empty list drawn from the site channel vocabulary.
- \`sources\` MUST be a non-empty list of \`{ title, url }\` — one entry per source you actually cite, each url drawn from the citation ledger below.

${dossierSection}
${ledgerSection}
## Curated seed sources (starting points — research OUTWARD from these)
These are the curated FeedItems that seeded this assignment. Read their full text, then follow their citations, find the primary papers/official docs, and appraise every source you add.

${sourceBlock(sources)}

## Encouraged components (this format's kit)
Import these from \`@/components/mdx\` and prefer them over prose-only sections:
${fmt.componentKit.map((c) => `- <${c}>`).join("\n")}

## Grounding & verification mandate (non-negotiable)
- Research like a PhD thesis: literature search, source discovery, credibility appraisal, triangulation. You MUST research to build the citation ledger — do not stop at the seeds above.
- Ground EVERY factual claim in the citation ledger: every assertion must trace to a ledger source (curated OR researched). Load-bearing claims must be corroborated by ≥2 INDEPENDENT sources; prefer High-tier (primary/peer-reviewed) over secondary, secondary over Low.
- Reflect each cited url in the \`sources\` frontmatter array AND cite it inline (e.g. an \`<Annotation>\` or a link). Every \`sources\` url MUST be in the ledger.
- Do NOT fabricate facts, numbers, names, dates, or quotes. If a claim cannot be grounded in an appraised ledger source, cut it. A Low-tier source alone never grounds a load-bearing claim.
- Prefer interactive components over prose-only explanation — the chart/diagram should arrive before the words that explain it.
- Use ONLY components from the kit above; do not invent component names.

## Target length
${
    fmt.length === "feature"
      ? "Feature — 20–25 min read FLOOR (~5,000–7,000+ words, can go longer) with the FULL expanded per-format component kit. The length is EARNED from more scenes / data layers / mechanism coverage / worked examples / knowledge-carrying components — never from padding or hedging. Target at least one knowledge-carrying island (Chart/Diagram/Simulation/Figure/Stepper/Table/Scrolly/StateMachine/etc.) per ~800–1,000 words: components carry blocks of knowledge, prose wraps around them to interpret."
      : "Brief (~300–500 words). The 20–25 min feature floor does NOT apply — brevity is this format's craft; do not pad a briefing."
  }
`;
}
