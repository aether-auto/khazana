// One-off re-sanitize: loads the existing data/feed/curated.json, runs ONLY
// the improved boilerplate stripper over each item's stored body HTML (no
// network — purely cleans the stored HTML), and writes back the file.
//
// Usage: pnpm exec tsx scripts/resanitize.mts
import * as fs from "node:fs";
import * as path from "node:path";
import { stripBoilerplate } from "../packages/ingest/src/extract.ts";

const dataDir = new URL("../data/feed/", import.meta.url).pathname;
const curatedPath = path.join(dataDir, "curated.json");

if (!fs.existsSync(curatedPath)) {
  console.error(`[resanitize] ${curatedPath} not found — run real-ingest first`);
  process.exit(1);
}

type FeedItem = {
  id: string;
  title?: string;
  body?: string | null;
  [k: string]: unknown;
};

const raw = fs.readFileSync(curatedPath, "utf8");
const items = JSON.parse(raw) as FeedItem[];
console.log(`[resanitize] loaded ${items.length} items from ${curatedPath}`);

let changed = 0;
let unchanged = 0;
let noBody = 0;

// Track a before/after example for the report
let exampleId: string | null = null;
let exampleBefore: string | null = null;
let exampleAfter: string | null = null;

// Heuristic: body has a nav-leak if the first 600 chars have a high link density
function isLeakyBody(body: string): boolean {
  const first600 = body.slice(0, 600);
  const links = (first600.match(/<a /g) ?? []).length;
  const textLen = first600.replace(/<[^>]+>/g, "").trim().length;
  return links >= 4 || /^<a[^>]*>Skip to/i.test(body.trim());
}

for (const item of items) {
  if (!item.body) { noBody++; continue; }

  const before = item.body;
  const after = stripBoilerplate(before);

  if (after !== before) {
    // Capture the first changed item as an example
    if (!exampleId && isLeakyBody(before)) {
      exampleId = item.id;
      exampleBefore = before.slice(0, 600);
      exampleAfter = after.slice(0, 600);
    }
    item.body = after;
    changed++;
  } else {
    unchanged++;
  }
}

fs.writeFileSync(curatedPath, JSON.stringify(items, null, 2), "utf8");
console.log(`[resanitize] done — changed=${changed}  unchanged=${unchanged}  no-body=${noBody}`);

if (exampleId && exampleBefore && exampleAfter) {
  console.log(`\n[resanitize] BEFORE example (item ${exampleId}, first 600 chars):\n`);
  console.log(exampleBefore);
  console.log(`\n[resanitize] AFTER (same item):\n`);
  console.log(exampleAfter);
}
