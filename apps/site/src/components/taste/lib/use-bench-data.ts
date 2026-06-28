// React binding for the shared bench payload. CRITICAL for hydration safety: the
// server renders islands with EMPTY data (it can't read the JSON <script> — there's
// no DOM during SSR), so the client's FIRST render must ALSO be EMPTY to match.
// Real data is read from the DOM in a post-hydration effect, which then triggers a
// re-render. This avoids React hydration-mismatch (#418) while still loading the
// single shared payload exactly once.
import { useEffect, useState } from "react";
import { readBenchData, EMPTY_BENCH_DATA, type BenchData } from "./bench-data.js";

export function useBenchData(): BenchData {
  const [data, setData] = useState<BenchData>(EMPTY_BENCH_DATA);
  useEffect(() => {
    setData(readBenchData());
  }, []);
  return data;
}
