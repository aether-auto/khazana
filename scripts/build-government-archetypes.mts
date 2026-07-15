/**
 * Materializes the hand-authored `GovArchetypeLibrary` (scripts/government-archetypes-data.mts)
 * to `data/world/government-archetypes.json` in the private
 * `aether-auto/khazana-world-data` repo (D2, docs/world-data-repo.md), matching the
 * write pattern established by scripts/build-india-states-topojson.mts.
 *
 * The archetype content itself is NOT a network fetch — it is committed, reviewed
 * TypeScript data (scripts/government-archetypes-data.mts) — so this script's only
 * job is to serialize it and land it in the private repo (real push, when
 * WORLD_DATA_REPO_TOKEN is set) or write it locally to `.world-data/data/world/…`
 * (when the token is absent — the same checkout path the world-data-repo.md
 * read/write conventions and CI use, so `scripts/validate-government-archetypes.mts`
 * can validate the real content without a live private repo).
 *
 * Usage (from repo root):
 *   pnpm exec tsx scripts/build-government-archetypes.mts
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { GovArchetypeLibrarySchema } from "../packages/core/src/index.ts";
import { buildGovernmentArchetypeLibrary } from "./government-archetypes-data.mts";
import { validateLibrary } from "./validate-government-archetypes.mts";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

/** Zod-shape-parses AND runs the full semantic validator (unique ids/slots, declared-slot
 * edges, no self-loops, generic default-basis text, required family coverage) — never
 * publish (locally OR to the private repo) an artifact that would fail
 * `validate-government-archetypes.mts` itself. */
export function serializeLibrary(): string {
  const library = GovArchetypeLibrarySchema.parse(buildGovernmentArchetypeLibrary());
  const result = validateLibrary(library);
  if (!result.ok) {
    throw new Error(`[build-government-archetypes] refusing to publish an invalid library:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`);
  }
  return JSON.stringify(library, null, 2) + "\n";
}

/** Strips a `basic <base64>` credential (and the token it decodes to) out of an error's
 * message, so a failing authenticated git command never leaks WORLD_DATA_REPO_TOKEN into
 * CI logs. `execFileSync`'s thrown "Command failed: …" message embeds the full argv,
 * including the `-c http.extraheader=AUTHORIZATION: basic <token-b64>` we pass below. */
function scrubTokenFromError(err: unknown, token: string): Error {
  const raw = err instanceof Error ? err.message : String(err);
  const tokenB64 = Buffer.from(`x-access-token:${token}`).toString("base64");
  const scrubbed = raw.split(token).join("[REDACTED]").split(tokenB64).join("[REDACTED]");
  return new Error(scrubbed);
}

/** `execFileSync` wrapper for the two auth-header git calls — always scrubs the token
 * out of any thrown error before it reaches a caller/logger. */
function runAuthedGit(args: string[], opts: Parameters<typeof execFileSync>[2], token: string): void {
  try {
    execFileSync("git", args, opts);
  } catch (err) {
    throw scrubTokenFromError(err, token);
  }
}

async function main(): Promise<void> {
  const json = serializeLibrary();

  // Local checkout path — mirrors docs/world-data-repo.md's `path: .world-data`
  // read/write convention, so the committed validator can run against real
  // content without a live private repo.
  const localOutDir = join(repoRoot, ".world-data", "data", "world");
  mkdirSync(localOutDir, { recursive: true });
  const localOutPath = join(localOutDir, "government-archetypes.json");
  writeFileSync(localOutPath, json);
  console.log(`[build-government-archetypes] wrote ${localOutPath}`);

  const wdToken = process.env.WORLD_DATA_REPO_TOKEN;
  if (!wdToken) {
    console.warn(
      "[build-government-archetypes] WORLD_DATA_REPO_TOKEN not set — skipping push to aether-auto/khazana-world-data. Output written locally only (not committed to the public khazana repo).",
    );
    return;
  }

  const workDir = mkdtempSync(join(tmpdir(), "gov-archetypes-"));
  try {
    const auth = Buffer.from(`x-access-token:${wdToken}`).toString("base64");
    const wdDir = join(workDir, "world-data");
    runAuthedGit(
      [
        "-c",
        `http.extraheader=AUTHORIZATION: basic ${auth}`,
        "clone",
        "--depth=1",
        "https://github.com/aether-auto/khazana-world-data.git",
        wdDir,
      ],
      { stdio: "inherit" },
      wdToken,
    );
    const wdOutDir = join(wdDir, "data", "world");
    mkdirSync(wdOutDir, { recursive: true });
    writeFileSync(join(wdOutDir, "government-archetypes.json"), json);

    execFileSync("git", ["add", "-A"], { cwd: wdDir, stdio: "inherit" });
    try {
      execFileSync(
        "git",
        [
          "-c",
          "user.name=khazana-bot",
          "-c",
          "user.email=bot@khazana",
          "commit",
          "-m",
          "chore: add government archetype library",
        ],
        { cwd: wdDir, stdio: "inherit" },
      );
    } catch {
      console.log("[build-government-archetypes] nothing to commit (world-data already up to date)");
      return;
    }
    runAuthedGit(
      ["-c", `http.extraheader=AUTHORIZATION: basic ${auth}`, "push", "origin", "HEAD:main"],
      { cwd: wdDir, stdio: "inherit" },
      wdToken,
    );
    console.log("[build-government-archetypes] pushed to aether-auto/khazana-world-data");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

const here = fileURLToPath(import.meta.url);
if (process.argv[1] === here) {
  main().catch((err) => {
    console.error(`[build-government-archetypes] failed: ${(err as Error).message}`);
    process.exit(1);
  });
}
