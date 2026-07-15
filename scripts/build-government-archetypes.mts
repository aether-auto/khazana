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

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

export function serializeLibrary(): string {
  const library = GovArchetypeLibrarySchema.parse(buildGovernmentArchetypeLibrary());
  return JSON.stringify(library, null, 2) + "\n";
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
    execFileSync(
      "git",
      [
        "-c",
        `http.extraheader=AUTHORIZATION: basic ${auth}`,
        "clone",
        "--depth=1",
        "https://github.com/aether-auto/khazana-world-data.git",
        wdDir,
      ],
      { stdio: "inherit" },
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
    execFileSync(
      "git",
      ["-c", `http.extraheader=AUTHORIZATION: basic ${auth}`, "push", "origin", "HEAD:main"],
      { cwd: wdDir, stdio: "inherit" },
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
