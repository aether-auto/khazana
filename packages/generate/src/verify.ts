import type { FeedItem } from "@khazana/core";
import { validateDraft } from "./validate.js";

export interface FactCheckResult {
  ok: boolean;
  notes: string;
}
export type FactChecker = (input: { mdx: string; sources: FeedItem[] }) => Promise<FactCheckResult>;

export interface DraftCheck {
  slug: string;
  file: string;
  ok: boolean;
  errors: string[];
  factCheck?: FactCheckResult;
}

export interface VerifyReport {
  ok: boolean;
  generatedAt: string;
  drafts: DraftCheck[];
}

export interface VerifyOpts {
  now: string;
  factChecker?: FactChecker;
}

export async function runVerify(
  drafts: { file: string; mdx: string }[],
  curated: FeedItem[],
  opts: VerifyOpts,
): Promise<VerifyReport> {
  const knownUrls = new Set(curated.map((it) => it.url));
  const byUrl = new Map(curated.map((it) => [it.url, it]));
  const out: DraftCheck[] = [];

  for (const draft of drafts) {
    const result = validateDraft(draft.mdx, knownUrls);
    const check: DraftCheck = {
      slug: result.slug,
      file: draft.file,
      ok: result.ok,
      errors: [...result.errors],
    };

    if (opts.factChecker) {
      // Only fact-check structurally valid drafts; pass the cited source items.
      const sources = curated.filter((it) => knownUrls.has(it.url) && byUrl.has(it.url));
      const fc = await opts.factChecker({ mdx: draft.mdx, sources });
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
