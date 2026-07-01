import type { CandidateSource, FeedItem, Registry } from "@khazana/core";
import { dedupeCandidates } from "./candidate.js";
import { mineLinks, type LinkMineOpts } from "./generators/link-mine.js";
import { domainFrequency, type DomainFrequencyOpts } from "./generators/domain-frequency.js";
import { importOpml, type OpmlOpts } from "./generators/opml.js";
import {
  discoverYouTubeChannels,
  type DiscoverYouTubeOpts,
  type VideoMetaLookup,
} from "./generators/youtube-channels.js";

export interface GenerateInput {
  registry: Registry;
  /** High-quality, enriched items (for link-mining). Usually `data/feed/curated.json`. */
  curated?: FeedItem[];
  /** Raw items incl. HN/Reddit aggregators (for domain-frequency). Usually `data/feed/raw.json`. */
  raw?: FeedItem[];
  /** Optional OPML string to import (blogroll / awesome-list export). */
  opml?: string;
  /**
   * Per-video metadata lookup for the YouTube channel miner (usually populated
   * from ingest's `fetchYouTubeVideoMeta` over curated video items). When absent,
   * curated-channel mining is skipped.
   */
  youtubeMetaLookup?: VideoMetaLookup;
  /** Raw `yt-dlp ytsearch` stdout to parse into channel candidates (orchestrator runs the live search). */
  youtubeSearchStdout?: string;
}

export interface GenerateOpts {
  linkMine?: LinkMineOpts;
  domainFrequency?: DomainFrequencyOpts;
  opml?: OpmlOpts;
  /** YouTube channel discovery ranking/threshold options. */
  youtube?: DiscoverYouTubeOpts;
  /** Max candidates to return after dedupe/ranking. Default 200. */
  limit?: number;
}

/**
 * Run every no-AI candidate generator over already-available data, concatenate
 * their raw candidates, then dedupe against the registry and against each other
 * (merging evidence + summing seenCount, ranked by seenCount). Fully pure — no
 * network, no LLM. This is what a discovery run generates for the cloud
 * appraiser to judge.
 */
export function generateCandidates(input: GenerateInput, opts: GenerateOpts = {}): CandidateSource[] {
  const raw: CandidateSource[] = [];

  if (input.curated?.length) raw.push(...mineLinks(input.curated, input.registry, opts.linkMine));
  if (input.raw?.length) raw.push(...domainFrequency(input.raw, input.registry, opts.domainFrequency));
  if (input.opml) raw.push(...importOpml(input.opml, input.registry, opts.opml));

  // Domain-based dedupe for site/blog candidates (each has a distinct domain).
  const deduped = dedupeCandidates(raw, input.registry);

  // YouTube channels dedup by CHANNEL ID (every channel shares youtube.com), so
  // they bypass the domain deduper and are appended as their own already-ranked
  // block. YouTube's measurable credibility is what ranks them.
  const youtube = discoverYouTubeChannels(
    {
      registry: input.registry,
      curated: input.curated,
      metaLookup: input.youtubeMetaLookup,
      searchStdout: input.youtubeSearchStdout,
    },
    opts.youtube,
  );

  const merged = [...deduped, ...youtube];
  return opts.limit ? merged.slice(0, opts.limit) : merged;
}

/**
 * Render the candidate brief the cloud appraiser (Claude Code Action, Sonnet)
 * reads. It lays out each candidate's provenance, evidence, and recurrence —
 * everything needed for a credibility + channel-fit call — WITHOUT making that
 * call here. The appraiser writes its verdicts to `data/scout/appraisal.json`,
 * which `scout apply` folds through evaluate → apply into the registry (auto-add
 * high-confidence, queue borderline into `sources.pending.json`).
 */
export function renderCandidateBrief(candidates: CandidateSource[], now: string): string {
  const rows = candidates.length
    ? candidates
        .map((c, i) => {
          const feed = c.feedUrl ? `\n   - feed: ${c.feedUrl}` : "";
          const ev = c.evidence.length ? c.evidence.map((e) => `\n   - ${e}`).join("") : "\n   - (no evidence recorded)";
          return `${i + 1}. **${c.url}** (via ${c.discoveredVia}, seen ${c.seenCount}×)${feed}${ev}`;
        })
        .join("\n\n")
    : "(none)";

  return `# Source Scout — candidate appraisal brief

_Generated ${now}. These candidates were produced deterministically (no AI) by
link-mining our best reads, tallying aggregator link frequency, and OPML import.
For the cloud appraiser (Sonnet): judge each candidate's **credibility** and
**channel fit**, then write verdicts to \`data/scout/appraisal.json\`._

## Candidates (ranked by recurrence)

${rows}

## Output contract — write \`data/scout/appraisal.json\`
A JSON array, one object per candidate you judge:
\`\`\`json
[
  {
    "url": "https://example.com",
    "channels": ["ai", "tech"],
    "trust": 0.82,
    "decision": "approve"
  }
]
\`\`\`
- \`channels\`: from khazana's channel vocabulary; unknown channels are dropped.
- \`trust\`: your 0..1 credibility judgment (reputable, verifiable, low-noise).
- \`decision\`: \`approve\` (auto-add), \`queue\` (borderline → \`sources.pending.json\`
  for one-tap review), or \`reject\`. Omit to let the trust threshold decide.
- Judge only from evidence + your own verification; do not invent sources.
`;
}
