import { FORMATS, type FeedItem } from "@khazana/core";
import type { Assignment } from "./select.js";

function sourceBlock(items: FeedItem[]): string {
  return items
    .map(
      (it) =>
        `- **id:** \`${it.id}\` — **${it.title}**\n` +
        `  - url: ${it.url}\n` +
        `  - summary: ${it.summary || "(no summary)"}`,
    )
    .join("\n");
}

export function buildBrief(assignment: Assignment, items: FeedItem[], style: string): string {
  const fmt = FORMATS[assignment.format];
  const byId = new Map(items.map((it) => [it.id, it]));
  const sources = assignment.sourceItemIds
    .map((id) => byId.get(id))
    .filter((it): it is FeedItem => it !== undefined);

  const channelsYaml = [assignment.channel].map((c) => `  - ${c}`).join("\n");
  const sourcesYaml = sources.map((it) => `  - { title: "<title>", url: "${it.url}" }`).join("\n");

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
- \`sources\` MUST be a non-empty list of \`{ title, url }\` — one entry per source you actually cite, using the URLs below verbatim.

## Source items to synthesize and CITE
Use ONLY these items. Every factual claim must trace to one of them.

${sourceBlock(sources)}

## Encouraged components (this format's kit)
Import these from \`@/components/mdx\` and prefer them over prose-only sections:
${fmt.componentKit.map((c) => `- <${c}>`).join("\n")}

## Grounding & verification mandate (non-negotiable)
- Cite EVERY factual claim: every assertion must be traceable to one of the source items above.
- Reflect each cited item's URL in the \`sources\` frontmatter array AND cite it inline (e.g. an \`<Annotation>\` or a link).
- Do NOT introduce facts, numbers, names, or dates that are not supported by a listed source. If a claim cannot be grounded, cut it.
- Prefer interactive components over prose-only explanation — the chart/diagram should arrive before the words that explain it.
- Use ONLY components from the kit above; do not invent component names.

## Target length
${fmt.length === "feature" ? "Feature (~1500–2500 words) + interactive components." : "Brief (~300–500 words)."}
`;
}
