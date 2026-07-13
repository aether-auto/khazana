import { CHANNELS, type EngagementEvent, type FeedItem, type Registry } from "@khazana/core";

/**
 * A channel that has LOST sources to our own auto-disable path and should be
 * aggressively backfilled — even if it still sits above the absolute floor.
 * This is the "rebalance by ADDING, never by pruning healthy sources" lever:
 * discovery prioritizes replacing what auto-disable removed, keeping every
 * channel fresh instead of silently thinning out as feeds die.
 */
export interface ChannelDeficit {
  channel: string;
  /** Currently-enabled sources covering this channel. */
  enabled: number;
  /** Sources we auto-disabled (status:"disabled") that covered this channel. */
  disabled: number;
  /** Distinct source TYPES that were lost — so backfill can target like-for-like. */
  lostTypes: string[];
}

export interface GapReport {
  underservedChannels: string[];
  /** Channels that recently lost sources to auto-disable, most-lost first. */
  depletedChannels: ChannelDeficit[];
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

  // Depletion: channels that lost sources to our OWN auto-disable (status
  // "disabled"). A source turned off by hand keeps a different status (e.g.
  // "active") and is NOT a loss we should backfill. Ranked most-lost first so
  // the aggressive rebalance targets the biggest gaps; ties break on fewest
  // enabled (thinnest) then channel name (deterministic).
  const depletedChannels: ChannelDeficit[] = CHANNELS.map((ch) => {
    const inChannel = registry.sources.filter((src) => src.channels.includes(ch));
    const lost = inChannel.filter((src) => !src.enabled && src.status === "disabled");
    return {
      channel: ch,
      enabled: inChannel.filter((src) => src.enabled).length,
      disabled: lost.length,
      lostTypes: [...new Set(lost.map((src) => src.type))].sort(),
    };
  })
    .filter((d) => d.disabled > 0)
    .sort((a, b) => b.disabled - a.disabled || a.enabled - b.enabled || a.channel.localeCompare(b.channel));

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

  return { underservedChannels, depletedChannels, engagedDomains, outboundDomains };
}

/**
 * The ordered channel list discovery should prioritize when finding NEW sources:
 * depleted channels first (most-lost first — the aggressive backfill lever),
 * then any channel below the absolute floor, deduped and order-preserving. Feed
 * this to `buildYtSearchQueries` (or any targeted discovery) so a channel that
 * just lost sources gets replacements in the very next pass, rather than waiting
 * to fall all the way to the floor.
 */
export function backfillTargets(gaps: GapReport): string[] {
  return [...new Set([...gaps.depletedChannels.map((d) => d.channel), ...gaps.underservedChannels])];
}

export function renderBrief(gaps: GapReport, now: string): string {
  const list = (xs: string[]): string => (xs.length ? xs.map((x) => `- ${x}`).join("\n") : "- (none)");
  const depleted = gaps.depletedChannels.length
    ? gaps.depletedChannels
        .map(
          (d) =>
            `- **${d.channel}** — lost ${d.disabled} source(s) (types: ${d.lostTypes.join(", ") || "?"}), ${d.enabled} still enabled`,
        )
        .join("\n")
    : "- (none)";
  return `# Source Scout — discovery brief

_Generated ${now}. For the Claude Action: web-search for reputable, verifiable sources
that fill the gaps below, then write candidates to \`data/scout/candidates.json\`._

## Discovery priority order (backfill these channels first)
${list(backfillTargets(gaps))}

## Depleted channels — BACKFILL FIRST (lost sources to auto-disable)
_Aggressively rebalance: find NEW sources for these channels (prefer the lost
source types) to keep them fresh. We never re-enable a dead feed to paper over a
gap — we add healthy replacements._
${depleted}

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
