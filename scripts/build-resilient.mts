// scripts/build-resilient.mts
//
// Resilient site build wrapper. A single bad Read (an MDX file that throws at
// SSG time — a syntax error, or a component handed a malformed prop that fails
// during `_createMdxContent`) must NEVER be able to take down the whole deploy
// and freeze every future feed-refresh build. So this wraps `astro build`:
//
//   1. Run `pnpm --filter @khazana/site build`, capturing stdout+stderr.
//   2. On failure, parse the error to find the offending Read's slug (astro/vite
//      name it — either `.../content/blog/<slug>.mdx` for parse errors or the
//      chunk `chunks/<slug>_<hash>.mjs` / route `/reads/<slug>/` for runtime
//      `_createMdxContent` errors).
//   3. QUARANTINE that Read: move it OUT of the content-collection glob (to
//      `apps/site/.quarantine/<slug>.mdx`), log the slug + reason, and retry.
//   4. Loop until the build succeeds.
//
// SAFETY CAP (critical): a `MAX_QUARANTINE` limit (default 3). If more Reads than
// that would need quarantining — OR if the build fails for a reason NOT
// attributable to a specific Read (a real code/component bug, a config error) —
// ABORT with a non-zero exit. A systemic bug must fail LOUDLY, never silently
// nuke the whole Reads corpus.
//
// The quarantine is EPHEMERAL per run: the workflow does not commit the move, so
// the source Read stays in git; the point is only that the deploy always ships
// with the Reads that DO build. CI (ci.yml) runs the strict `astro build` so a
// build-breaking Read still turns CI red at push time.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(import.meta.url);
const repoRoot = join(dirname(here), "..");
const blogDir = join(repoRoot, "apps", "site", "src", "content", "blog");
const quarantineDir = join(repoRoot, "apps", "site", ".quarantine");
const distDir = join(repoRoot, "apps", "site", "dist");
const reportPath = join(distDir, "_quarantine-report.json");

export interface QuarantineEntry {
  slug: string;
  from: string;
  to: string;
  reason: string;
}

/**
 * Extract the slug of the Read that broke the build from astro/vite's error
 * output. Pure + unit-tested. Patterns, in descending confidence:
 *   - runtime MDX error stack:  dist/chunks/<slug>_<hash>.mjs
 *   - route being rendered:      /reads/<slug>/
 *   - parse/transform error:     src/content/blog/<slug>.mdx
 *
 * When `knownSlugs` is supplied, only a candidate that matches an actual Read on
 * disk is returned — anything else (a component .tsx path, a config file) is
 * treated as "not attributable to a Read" so the caller ABORTS instead of
 * quarantining the wrong thing. Returns null when no Read slug can be found.
 */
export function parseFailedSlug(output: string, knownSlugs?: readonly string[]): string | null {
  // Slugs are kebab-case (lowercase letters, digits, hyphens) — no underscores,
  // which lets the chunk pattern split `<slug>_<hash>` unambiguously.
  const patterns: RegExp[] = [
    /chunks\/([a-z0-9][a-z0-9-]*)_[A-Za-z0-9_-]{4,}\.mjs/g,
    /[/\\]reads[/\\]([a-z0-9][a-z0-9-]*)[/\\]/g,
    /content[/\\]blog[/\\]([a-z0-9][a-z0-9-]*)\.mdx/g,
  ];

  const candidates: string[] = [];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(output)) !== null) {
      if (m[1]) candidates.push(m[1]);
    }
  }
  if (candidates.length === 0) return null;

  if (knownSlugs) {
    const known = new Set(knownSlugs);
    for (const c of candidates) if (known.has(c)) return c;
    return null; // matched a path, but not a real Read → not attributable
  }
  return candidates[0] ?? null;
}

/**
 * Pull a short, human-readable failure reason out of the build output — the
 * error message and any astro "Hint". Kept concise for the summary/report; the
 * full tail is attached separately when aborting.
 */
export function extractReason(output: string): string {
  const lines = output.split(/\r?\n/);
  const keyword =
    /(is not defined|is not a function|Cannot read|Cannot find|Could not|Unexpected|Expected|SyntaxError|TypeError|ReferenceError|Invalid|ENOENT|throw|error:)/i;
  const hits: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (keyword.test(line)) {
      hits.push(line);
      if (hits.length >= 2) break;
    }
  }
  if (hits.length > 0) return hits.join(" | ").slice(0, 400);
  // Fallback: last non-empty line.
  const tail = lines.map((l) => l.trim()).filter(Boolean);
  return (tail[tail.length - 1] ?? "unknown build failure").slice(0, 400);
}

function listBlogSlugs(): string[] {
  if (!existsSync(blogDir)) return [];
  return readdirSync(blogDir)
    .filter((f) => f.endsWith(".mdx") || f.endsWith(".md"))
    .map((f) => f.replace(/\.mdx?$/, ""));
}

function runBuild(): { ok: boolean; output: string } {
  const r = spawnSync("pnpm", ["--filter", "@khazana/site", "build"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 1 << 28, // 256MB — Reads sites emit thousands of route lines
  });
  const output = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  // Echo through so the run log shows the real build output.
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return { ok: r.status === 0, output };
}

function writeReport(quarantined: QuarantineEntry[], ok: boolean, error?: string): void {
  try {
    mkdirSync(distDir, { recursive: true });
    writeFileSync(
      reportPath,
      JSON.stringify({ ok, generatedAt: new Date().toISOString(), quarantined, error }, null, 2),
    );
  } catch {
    // dist may not exist on a hard abort; the stdout summary is the backstop.
  }
}

function abort(message: string, output: string, quarantined: QuarantineEntry[]): never {
  writeReport(quarantined, false, message);
  console.error("\n============================================================");
  console.error(`[build-resilient] ABORT: ${message}`);
  console.error("[build-resilient] This is NOT a single bad Read — it is a systemic");
  console.error("[build-resilient] failure (code/component/config bug, or too many");
  console.error("[build-resilient] broken Reads). Refusing to silently gut the site.");
  console.error("------------------------------------------------------------");
  console.error(output.split(/\r?\n/).slice(-30).join("\n"));
  console.error("============================================================\n");
  process.exit(1);
}

async function main(): Promise<void> {
  const MAX_QUARANTINE = Number.parseInt(process.env.MAX_QUARANTINE ?? "3", 10);
  const cap = Number.isFinite(MAX_QUARANTINE) && MAX_QUARANTINE >= 0 ? MAX_QUARANTINE : 3;

  const quarantined: QuarantineEntry[] = [];
  const seen = new Set<string>();

  // Hard iteration bound: never loop more times than there are Reads (+slack).
  const maxAttempts = listBlogSlugs().length + 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[build-resilient] build attempt ${attempt}...`);
    const { ok, output } = runBuild();
    if (ok) {
      writeReport(quarantined, true);
      console.log("\n[build-resilient] BUILD SUCCEEDED.");
      if (quarantined.length === 0) {
        console.log("[build-resilient] No Reads quarantined — clean build.");
      } else {
        console.warn(`[build-resilient] ${quarantined.length} Read(s) QUARANTINED (skipped from deploy):`);
        for (const q of quarantined) {
          console.warn(`  - ${q.slug}: ${q.reason}`);
        }
        console.warn("[build-resilient] These Reads did NOT build and were left OUT of the");
        console.warn("[build-resilient] deploy. CI (strict astro build) will flag them red.");
      }
      console.log(`[build-resilient] report → ${reportPath}`);
      return;
    }

    // Build failed — is it attributable to a specific Read we can quarantine?
    const knownSlugs = listBlogSlugs();
    const slug = parseFailedSlug(output, knownSlugs);
    if (!slug) {
      abort(
        "build failed but no offending Read could be identified — likely a code, component, or config bug",
        output,
        quarantined,
      );
    }
    const file = join(blogDir, `${slug}.mdx`);
    if (!existsSync(file)) {
      abort(`identified slug "${slug}" but no matching file at ${file} — not attributable to a Read`, output, quarantined);
    }
    if (seen.has(slug)) {
      // We already moved this Read out and the build failed the SAME way — the
      // fault is not this Read. Systemic; bail loudly.
      abort(`Read "${slug}" was already quarantined yet the build still fails on it — systemic bug, not a bad Read`, output, quarantined);
    }
    if (quarantined.length >= cap) {
      abort(
        `MAX_QUARANTINE (${cap}) reached — refusing to quarantine "${slug}" and beyond. Too many Reads fail to build; treat as systemic`,
        output,
        quarantined,
      );
    }

    const reason = extractReason(output);
    mkdirSync(quarantineDir, { recursive: true });
    const dest = join(quarantineDir, `${slug}.mdx`);
    renameSync(file, dest);
    seen.add(slug);
    quarantined.push({ slug, from: file, to: dest, reason });
    console.warn(`\n[build-resilient] QUARANTINED "${slug}" → ${dest}`);
    console.warn(`[build-resilient] reason: ${reason}`);
    console.warn("[build-resilient] retrying build without it...\n");
  }

  abort(`exceeded ${maxAttempts} build attempts without success`, "", quarantined);
}

// Only run when invoked directly (so tests can import the parser without
// triggering a build).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error("[build-resilient] unexpected error:", err);
    process.exit(1);
  });
}
