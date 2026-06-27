// Verify the arXiv full-text mirror flow against REAL recent papers.
//
// Fetches a few real arXiv items through the new mirror chain (real network,
// real defaultFetch) and prints, per paper: the mirror that won, the extracted
// word count, and the estimated read-minutes (must be >= 5 to clear the curate
// floor). Read-minutes use the SAME 225-wpm formula as curate's readTimeMinutes.
//
// $0 / public mirrors only. The ORCHESTRATOR runs this — not the implementer.
//
//   pnpm exec tsx packages/ingest/scripts/verify-arxiv.mts
//
// Optional: override the paper list with comma-separated abs URLs / ids:
//   ARXIV_VERIFY_IDS="2501.01234,2402.09353" pnpm exec tsx packages/ingest/scripts/verify-arxiv.mts

import { fetchArxivFullText, arxivHtmlUrls } from "../src/arxiv-fulltext.ts";
import { defaultFetch } from "../src/fetchers/build-source.ts";
import { htmlToText } from "../src/extract.ts";

const WPM = 225; // matches @khazana/curate readTimeMinutes
const FLOOR_MIN = 5;

// A few real, well-known arXiv papers (modern HTML available on ar5iv/arxiv-html).
const DEFAULT_PAPERS = [
  "https://arxiv.org/abs/1706.03762", // Attention Is All You Need
  "https://arxiv.org/abs/2005.14165", // GPT-3
  "https://arxiv.org/abs/1810.04805", // BERT
];

const ids = (process.env["ARXIV_VERIFY_IDS"] ?? "").trim();
const papers = ids
  ? ids.split(",").map((s) => s.trim()).filter(Boolean)
  : DEFAULT_PAPERS;

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
function readMinutes(text: string): number {
  return Math.round(wordCount(text) / WPM);
}

let pass = 0;
for (const url of papers) {
  console.log(`\n=== ${url}`);
  console.log(`    mirrors: ${arxivHtmlUrls(url).join("  ·  ")}`);
  try {
    const t0 = Date.now();
    const result = await fetchArxivFullText({ url, sourceType: "arxiv" }, defaultFetch);
    const ms = Date.now() - t0;
    if (!result) {
      console.log(`    ✗ no full text recovered (${ms} ms)`);
      continue;
    }
    const text = htmlToText(result.article.html);
    const words = wordCount(text);
    const minutes = readMinutes(text);
    const clears = minutes >= FLOOR_MIN;
    if (clears) pass++;
    console.log(`    mirror used : ${result.mirror}`);
    console.log(`    words       : ${words.toLocaleString()}`);
    console.log(`    read-minutes: ${minutes}  ${clears ? `✓ clears ${FLOOR_MIN}-min floor` : `✗ under ${FLOOR_MIN} min`}`);
    console.log(`    fetch+extract: ${ms} ms`);
  } catch (err) {
    console.log(`    ✗ threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(`\n${pass}/${papers.length} papers cleared the ${FLOOR_MIN}-min read floor via the mirror flow.`);
