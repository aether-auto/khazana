import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBrief } from "./brief.js";
import {
  listDrafts,
  readCurated,
  readDraft,
  readLedger,
  readStyle,
  readTaste,
  writeBrief,
  writeReport,
} from "./io.js";
import { selectAssignments } from "./select.js";
import { runVerify, type FactChecker } from "./verify.js";

export interface CliDeps {
  dataDir: string;
  repoRoot: string;
  contentDir: string;
  now: string;
  factChecker?: FactChecker;
}

async function runPlan(deps: CliDeps): Promise<number> {
  const items = readCurated(deps.dataDir);
  const taste = readTaste(deps.dataDir);
  const style = readStyle(deps.repoRoot);
  const assignments = selectAssignments({ items, taste, now: deps.now });
  for (const a of assignments) {
    const path = writeBrief(deps.dataDir, a.slug, buildBrief(a, items, style));
    console.log(`[generate:plan] ${a.format} "${a.title}" → ${path}`);
  }
  console.log(`[generate:plan] ${assignments.length} brief(s) written.`);
  return 0;
}

/** filename basename without the .mdx extension — the draft's slug. */
function slugOf(file: string): string {
  return basename(file, ".mdx");
}

/**
 * Slug-scoped verify. With no slugs, checks every draft (unchanged contract).
 * With slugs, checks only the matching drafts; a requested slug with no matching
 * file is an error so the routine knows a draft it expected is missing.
 */
async function runVerifyCmd(deps: CliDeps, slugs: string[] = []): Promise<number> {
  const curated = readCurated(deps.dataDir);
  const ledger = readLedger(deps.dataDir);
  let files = listDrafts(deps.contentDir);

  if (slugs.length > 0) {
    const present = new Set(files.map(slugOf));
    const missing = slugs.filter((s) => !present.has(s));
    if (missing.length > 0) {
      console.error(`[generate:verify] requested slug(s) with no draft: ${missing.join(", ")}`);
      return 1;
    }
    const wanted = new Set(slugs);
    files = files.filter((f) => wanted.has(slugOf(f)));
  }

  const drafts = files.map((file) => ({ file, mdx: readDraft(file) }));
  const report = await runVerify(drafts, curated, { now: deps.now, ledger, factChecker: deps.factChecker });
  const path = writeReport(deps.dataDir, report);
  for (const d of report.drafts) {
    if (!d.ok) console.error(`[generate:verify] FAIL ${d.file}: ${d.errors.join("; ")}`);
  }
  console.log(`[generate:verify] ${report.drafts.filter((d) => d.ok).length}/${report.drafts.length} ok → ${path}`);
  return report.ok ? 0 : 1;
}

export async function main(argv: string[], deps: CliDeps): Promise<number> {
  const cmd = argv[0];
  if (cmd === "plan") return runPlan(deps);
  if (cmd === "verify") return runVerifyCmd(deps, argv.slice(1));
  console.error(`[generate] unknown subcommand: ${cmd ?? "(none)"} (expected "plan" or "verify")`);
  return 2;
}

const here = fileURLToPath(import.meta.url);
if (process.argv[1] === here) {
  const repoRoot = join(dirname(here), "..", "..", "..");
  const deps: CliDeps = {
    dataDir: join(repoRoot, "data"),
    repoRoot,
    contentDir: join(repoRoot, "apps", "site", "src", "content", "blog"),
    now: new Date().toISOString(),
  };
  main(process.argv.slice(2), deps)
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
