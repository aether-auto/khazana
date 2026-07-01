import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import { CHANNELS, FORMAT_NAMES } from "@khazana/core";

/**
 * Past-reads ledger — the durable record of every Read already published, in a
 * shape the SURVEY subagent consults to enforce NOVELTY (don't repeat a shipped
 * read) and to enable deliberate SERIES / CALLBACKS (extend one on purpose).
 *
 * This lives in `@khazana/generate` (not `@khazana/core`) on purpose: it parses
 * MDX frontmatter — a generation-pipeline concern that already depends on
 * `gray-matter` here and mirrors the site's blog frontmatter contract in
 * `validate.ts`. `@khazana/core` is contract-only (zod schemas, no I/O), so the
 * IO wrapper and frontmatter derivation belong on the generation side.
 */

const channelEnum = z.enum([...CHANNELS] as [string, ...string[]]);
const formatEnum = z.enum([...FORMAT_NAMES] as [string, ...string[]]);

/** One shipped Read, distilled for novelty / series reasoning. */
export const ReadsLedgerEntrySchema = z.object({
  /** URL slug (filename without .mdx). */
  slug: z.string().min(1),
  title: z.string().min(1),
  /** The read's thesis/summary (from frontmatter `summary`). */
  summary: z.string(),
  format: formatEnum,
  channels: z.array(channelEnum).min(1),
  /** ISO-8601 publish timestamp, normalized from Date | string. */
  publishedAt: z.string().datetime(),
  /** Source titles — the entity/topic fingerprint used for novelty overlap. */
  sourceTitles: z.array(z.string()).default([]),
  /** Source hostnames (deduped) — a cheap "has this ground already been covered" signal. */
  sourceHosts: z.array(z.string()).default([]),
});
export type ReadsLedgerEntry = z.infer<typeof ReadsLedgerEntrySchema>;

export const ReadsLedgerSchema = z.array(ReadsLedgerEntrySchema);
export type ReadsLedger = z.infer<typeof ReadsLedgerSchema>;

/** A parsed MDX file: its slug and its (untrusted) frontmatter object. */
export interface FrontmatterInput {
  slug: string;
  frontmatter: unknown;
}

// Tolerant view of the raw frontmatter we care about. Validation happens after
// normalization via ReadsLedgerEntrySchema, mirroring readCurated's safeParse.
const RawFrontmatterSchema = z.object({
  title: z.string(),
  format: formatEnum,
  channels: z.array(channelEnum).min(1),
  summary: z.string().default(""),
  publishedAt: z.union([z.string(), z.date()]),
  sources: z.array(z.object({ title: z.string(), url: z.string() })).default([]),
});

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * PURE builder: MDX frontmatters → ledger entries, newest-first. Frontmatter
 * missing required fields (title/format/channels/publishedAt) is skipped rather
 * than throwing, so one malformed post never breaks the whole ledger.
 */
export function buildReadsLedger(inputs: FrontmatterInput[]): ReadsLedgerEntry[] {
  const out: ReadsLedgerEntry[] = [];
  for (const { slug, frontmatter } of inputs) {
    const parsed = RawFrontmatterSchema.safeParse(frontmatter);
    if (!parsed.success) continue;
    const fm = parsed.data;
    const publishedAt =
      fm.publishedAt instanceof Date ? fm.publishedAt.toISOString() : new Date(fm.publishedAt).toISOString();
    if (Number.isNaN(Date.parse(publishedAt))) continue;
    const sourceTitles = fm.sources.map((s) => s.title);
    const sourceHosts = [...new Set(fm.sources.map((s) => hostOf(s.url)).filter((h): h is string => h !== null))];
    const entry: ReadsLedgerEntry = {
      slug,
      title: fm.title,
      summary: fm.summary,
      format: fm.format,
      channels: fm.channels,
      publishedAt,
      sourceTitles,
      sourceHosts,
    };
    // Belt-and-braces: only emit entries that satisfy the public schema.
    if (ReadsLedgerEntrySchema.safeParse(entry).success) out.push(entry);
  }
  out.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return out;
}

/**
 * IO wrapper: read `apps/site/src/content/blog/*.mdx`, parse frontmatter with
 * gray-matter, and build the ledger. Non-recursive; ignores non-.mdx files.
 */
export function readReadsLedger(blogDir: string): ReadsLedger {
  if (!existsSync(blogDir)) return [];
  const inputs: FrontmatterInput[] = readdirSync(blogDir)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => {
      const slug = basename(f, ".mdx");
      const raw = readFileSync(join(blogDir, f), "utf8");
      const { data } = matter(raw);
      return { slug, frontmatter: data };
    });
  return buildReadsLedger(inputs);
}
