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
  writeComponentCatalog,
  writeReport,
} from "./io.js";
import { selectAssignments } from "./select.js";
import { runVerify, type FactChecker } from "./verify.js";
import { buildComponentCatalog } from "./component-catalog.js";

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
 * Slug-scoped verify. Whole-corpus verify (every draft in the collection) is
 * gated behind an explicit `--all` flag — bare `verify` with no slugs is an
 * ERROR, not a silent fall-through to whole-corpus.
 *
 * Why: an unattended Reads-run agent (see `.claude/commands/reads-run.md`
 * Stage 5) invokes `generate verify` scoped to THIS run's newly-drafted
 * slugs. If its kept set is ever empty, a bare `verify` with no args used to
 * silently validate EVERY already-published draft in the collection against
 * a near-empty ephemeral per-run ledger — guaranteed spurious FAILs on live
 * Reads, which the recovery instructions could then DROP (delete the MDX and
 * un-publish it on the next commit). Requiring `--all` makes whole-corpus
 * verify an explicit, deliberate choice (used by tests/ops), never an
 * accidental default.
 */
async function runVerifyCmd(deps: CliDeps, args: string[] = []): Promise<number> {
  const all = args.includes("--all");
  const slugs = args.filter((a) => a !== "--all");

  if (!all && slugs.length === 0) {
    console.error(
      "[generate:verify] refusing to run with no slugs and no --all: bare `verify` no longer " +
        "scopes to the whole corpus (P1a safety fix). Pass explicit slug(s) — " +
        '`generate verify <slug1> <slug2> ...` — or `generate verify --all` to deliberately ' +
        "check every draft in the collection.",
    );
    return 1;
  }

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
    // Deterministic ledger-grounding stats — report-only, does not gate `ok`.
    // The claims-level coverage/corroboration gate stays with the adversarial
    // reads-verify LLM pass (see citation-stats.ts for why).
    if (d.citationStats) {
      const s = d.citationStats;
      const t = s.tierBreakdown;
      console.log(
        `[generate:verify] ${d.slug} citations: ${(s.ledgerCoverage * 100).toFixed(0)}% grounded ` +
          `(${s.groundedCount}/${s.citedCount}), ${s.independentSourceCount} independent source(s), ` +
          `tiers H:${t.high} M:${t.med} L:${t.low} unknown:${t.unknown}`,
      );
    }
    // Richness/density score — ALWAYS surfaced (report-only unless egregious,
    // which already failed the draft above via runVerify). See richness.ts.
    if (d.richness) {
      const r = d.richness;
      if (r.exempt) {
        console.log(`[generate:verify] ${d.slug} richness: exempt (${r.format}), ${r.words} words`);
      } else {
        const wpi = r.wordsPerIsland === null ? "n/a" : r.wordsPerIsland.toFixed(0);
        console.log(
          `[generate:verify] ${d.slug} richness: ${r.words} words, ${r.distinctIslandComponents.length} distinct ` +
            `island component(s) [${r.distinctIslandComponents.join(", ") || "none"}], ${r.islandInstanceCount} ` +
            `island instance(s), ${wpi} words/island (target ${r.targetBand.min}-${r.targetBand.max}) — ` +
            `${r.meetsTarget ? "meets target" : "BELOW target"}${r.egregious ? " — EGREGIOUS" : ""}`,
        );
      }
    }
  }
  console.log(`[generate:verify] ${report.drafts.filter((d) => d.ok).length}/${report.drafts.length} ok → ${path}`);
  return report.ok ? 0 : 1;
}

/**
 * Regenerate the writer-facing component catalog (name, blurb, props, kit(s),
 * LIVE usage count across `content/blog/*.mdx`) at
 * `.claude/skills/writers/component-catalog.json`. Run after adding/renaming a
 * component or shipping new Reads so usage counts stay current.
 */
async function runCatalog(deps: CliDeps): Promise<number> {
  const catalog = buildComponentCatalog(deps.contentDir, deps.now);
  const path = writeComponentCatalog(deps.repoRoot, catalog);
  const unused = catalog.components.filter((c) => c.usageCount === 0);
  console.log(`[generate:catalog] ${catalog.components.length} component(s) → ${path}`);
  if (unused.length > 0) {
    console.log(`[generate:catalog] ${unused.length} orphan(s) (0 live uses): ${unused.map((c) => c.name).join(", ")}`);
  }
  return 0;
}

export async function main(argv: string[], deps: CliDeps): Promise<number> {
  const cmd = argv[0];
  if (cmd === "plan") return runPlan(deps);
  if (cmd === "verify") return runVerifyCmd(deps, argv.slice(1));
  if (cmd === "catalog") return runCatalog(deps);
  console.error(`[generate] unknown subcommand: ${cmd ?? "(none)"} (expected "plan", "verify", or "catalog")`);
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
