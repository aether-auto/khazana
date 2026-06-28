// One shared payload for the bench islands, emitted ONCE as a JSON <script> by
// taste.astro and read by every island. Without this, three islands
// (BenchConsole, WhyThisItem, LiveSignal) each serialize the ~300-item candidate
// array into their props — tripling the page weight. Emitting once and reading
// from the DOM keeps the payload to a single copy. SSR-safe: `readBenchData`
// returns an empty payload on the server / when the script is absent.
import type { RerankItem } from "./rerank.js";
import type { RankProfile } from "@khazana/core";

export interface BenchData {
  candidates: RerankItem[];
  clusterSizes: Record<string, number>;
  profile: RankProfile;
  channels: string[];
  snapshotTopics: Record<string, number>;
  now: string;
}

export const EMPTY_BENCH_DATA: BenchData = {
  candidates: [],
  clusterSizes: {},
  profile: { ready: false, topics: {}, entities: {} },
  channels: [],
  snapshotTopics: {},
  now: new Date(0).toISOString(),
};
const EMPTY = EMPTY_BENCH_DATA;

/** The id of the JSON <script> taste.astro emits. */
export const BENCH_DATA_ID = "khz-bench-data";

/**
 * Read the single shared bench payload from the JSON <script> tag. Returns an
 * empty (but valid) payload if the script is missing or unparseable — islands then
 * render their honest empty states rather than throwing.
 */
export function readBenchData(): BenchData {
  if (typeof document === "undefined") return EMPTY;
  const el = document.getElementById(BENCH_DATA_ID);
  if (!el || !el.textContent) return EMPTY;
  try {
    const parsed = JSON.parse(el.textContent) as Partial<BenchData>;
    return {
      candidates: parsed.candidates ?? [],
      clusterSizes: parsed.clusterSizes ?? {},
      profile: parsed.profile ?? EMPTY.profile,
      channels: parsed.channels ?? [],
      snapshotTopics: parsed.snapshotTopics ?? {},
      now: parsed.now ?? EMPTY.now,
    };
  } catch {
    return EMPTY;
  }
}
