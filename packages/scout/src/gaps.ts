import { CHANNELS, type EngagementEvent, type FeedItem, type Registry } from "@khazana/core";

export interface GapReport {
  underservedChannels: string[];
  engagedDomains: string[];
  outboundDomains: string[];
}

export function normalizeDomain(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function registryDomains(registry: Registry): Set<string> {
  const set = new Set<string>();
  for (const s of registry.sources) {
    const d = normalizeDomain(s.url);
    if (d) set.add(d);
  }
  return set;
}

const TOP_N = 20;

export function computeGaps(
  registry: Registry,
  curated: FeedItem[],
  events: EngagementEvent[],
  opts: { minSourcesPerChannel?: number } = {},
): GapReport {
  const min = opts.minSourcesPerChannel ?? 2;

  const underservedChannels = CHANNELS.filter((ch) => {
    const count = registry.sources.filter((s) => s.enabled && s.channels.includes(ch)).length;
    return count < min;
  });

  const existing = registryDomains(registry);
  const sortUnique = (xs: string[]): string[] => [...new Set(xs)].sort();

  const engagedIds = new Set(events.map((e) => e.itemId));
  const engagedDomains = sortUnique(
    curated
      .filter((it) => engagedIds.has(it.id))
      .map((it) => normalizeDomain(it.url))
      .filter((d): d is string => d !== null && !existing.has(d)),
  );

  const topScored = [...curated]
    .sort((a, b) => (b.metrics?.score ?? 0) - (a.metrics?.score ?? 0))
    .slice(0, TOP_N);
  const outboundDomains = sortUnique(
    topScored
      .map((it) => normalizeDomain(it.url))
      .filter((d): d is string => d !== null && !existing.has(d)),
  );

  return { underservedChannels, engagedDomains, outboundDomains };
}

export function renderBrief(gaps: GapReport, now: string): string {
  const list = (xs: string[]): string => (xs.length ? xs.map((x) => `- ${x}`).join("\n") : "- (none)");
  return `# Source Scout — discovery brief

_Generated ${now}. For the Claude Action: web-search for reputable, verifiable sources
that fill the gaps below, then write candidates to \`data/scout/candidates.json\`._

## Under-served channels (need more sources)
${list(gaps.underservedChannels)}

## Domains the founder engages with but are not yet sources
${list(gaps.engagedDomains)}

## High-ranked item domains worth adding directly
${list(gaps.outboundDomains)}

## Output contract — write \`data/scout/candidates.json\`
A JSON array of objects:
\`\`\`json
[
  {
    "url": "https://example.com",
    "title": "Example Blog",
    "channels": ["ai", "tech"],
    "type": "eng-blog",
    "claimedTrust": 0.82,
    "rationale": "Reputable, primary-source engineering blog; active cadence."
  }
]
\`\`\`
- \`url\`: the site or feed URL (the harness autodiscovers the RSS/Atom feed).
- \`channels\`: from khazana's channel vocabulary; unknown channels are dropped.
- \`claimedTrust\`: your 0..1 credibility judgment (verifiable, reputable, low-noise).
- Only propose sources you can verify exist and are reputable.
`;
}
