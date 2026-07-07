import matter from "gray-matter";
import { type CitationLedger, type FeedItem, ledgerUrls } from "@khazana/core";
import { validateDraft } from "./validate.js";
import type { FactCheckVerdict } from "./fact-checker.js";
import { computeCitationStats, type CitationStats } from "./citation-stats.js";
import { computeRichness, EGREGIOUS_DISTINCT_ISLAND_FLOOR, type RichnessScore } from "./richness.js";

export interface FactCheckResult {
  ok: boolean;
  notes: string;
  verdict?: FactCheckVerdict;
}

/**
 * The adversarial verification hook. Receives the draft, the curated source items
 * it cites, and the FULL citation ledger (curated ∪ researched) so it can ground
 * against researched sources too. The deterministic gate lives in `checkClaims`;
 * this hook is where the cloud re-read maps claims -> ledger, then calls it.
 */
export type FactChecker = (input: {
  mdx: string;
  sources: FeedItem[];
  ledger: CitationLedger;
}) => Promise<FactCheckResult>;

export interface DraftCheck {
  slug: string;
  file: string;
  ok: boolean;
  errors: string[];
  factCheck?: FactCheckResult;
  /**
   * Deterministic ledger-grounding stats over this draft's frontmatter sources
   * (coverage %, independent-source count, tier breakdown). Always computed —
   * report-only, does not gate `ok`. NOT the claims-level factChecker gate
   * (see citation-stats.ts for why that stays with the adversarial verifier).
   */
  citationStats?: CitationStats;
  /**
   * Deterministic component-density / richness score (words, distinct
   * knowledge-carrying components, words-per-island vs the ~800-1,000-word
   * target). ALWAYS computed and surfaced — report-only EXCEPT the egregious
   * under-build floor, which fails the draft (see `richness.ts`).
   */
  richness?: RichnessScore;
}

/** Best-effort frontmatter `sources[]` read, tolerant of an unparseable draft. */
function frontmatterSources(mdx: string): { url: string }[] {
  try {
    const raw: unknown = matter(mdx).data?.sources;
    if (!Array.isArray(raw)) return [];
    return raw.filter((s): s is { url: string } => !!s && typeof s.url === "string");
  } catch {
    return [];
  }
}

export interface VerifyReport {
  ok: boolean;
  generatedAt: string;
  drafts: DraftCheck[];
}

export interface VerifyOpts {
  now: string;
  /** Citation ledger (curated ∪ researched-and-appraised). Widens the grounding gate. */
  ledger?: CitationLedger;
  factChecker?: FactChecker;
}

export async function runVerify(
  drafts: { file: string; mdx: string }[],
  curated: FeedItem[],
  opts: VerifyOpts,
): Promise<VerifyReport> {
  const ledger = opts.ledger ?? [];
  // Grounding gate = curated FeedItem urls ∪ ledger urls (curated ∪ researched).
  const knownUrls = new Set<string>([...curated.map((it) => it.url), ...ledgerUrls(ledger)]);
  const byUrl = new Map(curated.map((it) => [it.url, it]));
  const out: DraftCheck[] = [];

  for (const draft of drafts) {
    const result = validateDraft(draft.mdx, knownUrls);
    const richness = computeRichness(draft.mdx);
    const check: DraftCheck = {
      slug: result.slug,
      file: draft.file,
      ok: result.ok,
      errors: [...result.errors],
      citationStats: computeCitationStats(frontmatterSources(draft.mdx), ledger, curated),
      richness,
    };
    if (richness.egregious) {
      check.ok = false;
      check.errors.push(
        `richness: EGREGIOUS under-build — only ${richness.distinctIslandComponents.length} distinct ` +
          `knowledge-carrying component(s) (${richness.distinctIslandComponents.join(", ") || "none"}) in a ` +
          `${richness.words}-word ${richness.format} read (floor: ${EGREGIOUS_DISTINCT_ISLAND_FLOOR})`,
      );
    }

    if (opts.factChecker) {
      // Pass the curated items we have bodies for; the ledger carries researched
      // sources the checker maps claims against.
      const sources = curated.filter((it) => byUrl.has(it.url));
      const fc = await opts.factChecker({ mdx: draft.mdx, sources, ledger });
      check.factCheck = fc;
      if (!fc.ok) {
        check.ok = false;
        check.errors.push(`fact-check: ${fc.notes}`);
      }
    }

    out.push(check);
  }

  return { ok: out.every((d) => d.ok), generatedAt: opts.now, drafts: out };
}
