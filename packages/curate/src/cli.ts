import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readEvents, readRawFeed, writeCuratedFeed } from "./io.js";
import { runCurate } from "./curate.js";
import { makeLlmClientFromEnv } from "./gemini.js";
import type { LlmClient } from "./enrich.js";

export async function main(
  dataDir: string,
  now: string,
  deps: { client?: LlmClient | null } = {},
): Promise<void> {
  const client = deps.client !== undefined ? deps.client : makeLlmClientFromEnv();
  const items = readRawFeed(dataDir);
  const events = readEvents(dataDir);

  const { items: curated, clusterCount, profileReady } = await runCurate(items, events, client, { now });

  const path = writeCuratedFeed(dataDir, curated);
  console.log(
    `[curate] ${curated.length} items → ${clusterCount} clusters, ` +
      `taste ${profileReady ? "ready" : "warming up"}, llm ${client ? "on" : "off ($0)"} → ${path}`,
  );
}

const here = fileURLToPath(import.meta.url);
if (process.argv[1] === here) {
  const dataDir = join(dirname(here), "..", "..", "..", "data");
  main(dataDir, new Date().toISOString()).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
