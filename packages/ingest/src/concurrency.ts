/**
 * Concurrency and rate-limiting primitives for the ingest pipeline.
 *
 * Bounded pool:     cap total concurrent async operations.
 * PerHostLimiter:   cap concurrent requests to the SAME hostname AND enforce
 *                   a minimum inter-request gap so we don't hammer any single domain.
 * WhisperSemaphore: separate cap for CPU-bound Whisper transcription.
 */

/** Max total concurrent source fetches. Env: INGEST_CONCURRENCY */
export const DEFAULT_INGEST_CONCURRENCY = 6;

/** Max concurrent requests to the same hostname. Env: PER_HOST_MAX_CONCURRENT */
export const DEFAULT_PER_HOST_MAX_CONCURRENT = 2;

/** Min ms gap between successive requests to same host. Env: PER_HOST_MIN_GAP_MS */
export const DEFAULT_PER_HOST_MIN_GAP_MS = 200;

/** Max concurrent Whisper transcription jobs. Env: WHISPER_CONCURRENCY */
export const DEFAULT_WHISPER_CONCURRENCY = 1;

// ---------------------------------------------------------------------------
// pooledMap
// ---------------------------------------------------------------------------

/**
 * Run an async mapper over items with a strict concurrency cap.
 * Results are returned in the SAME ORDER as items (not completion order).
 * Never throws from the pool itself; individual fn() errors propagate normally.
 */
export async function pooledMap<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length) as R[];
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      const item = items[idx];
      if (item === undefined) break;
      results[idx] = await fn(item, idx);
    }
  };

  const workerCount = Math.min(limit, items.length);
  if (workerCount === 0) return results;

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

// ---------------------------------------------------------------------------
// Semaphore
// ---------------------------------------------------------------------------

export class Semaphore {
  private count: number;
  private readonly queue: Array<() => void> = [];

  constructor(limit: number) {
    this.count = limit;
  }

  async acquire(): Promise<() => void> {
    if (this.count > 0) {
      this.count--;
      return () => this.release();
    }
    return new Promise<() => void>((resolve) => {
      this.queue.push(() => {
        this.count--;
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.count++;
    }
  }
}

// ---------------------------------------------------------------------------
// PerHostLimiter
// ---------------------------------------------------------------------------

export class PerHostLimiter {
  private readonly maxConcurrent: number;
  private readonly minGapMs: number;
  /** Per-host min-gap overrides (e.g. reddit needs a much larger gap than default). */
  private readonly hostGapMs: Map<string, number>;
  private readonly semaphores = new Map<string, Semaphore>();
  private readonly lastFinished = new Map<string, number>();

  constructor(opts?: { maxConcurrent?: number; minGapMs?: number; hostGapMs?: Record<string, number> }) {
    this.maxConcurrent =
      opts?.maxConcurrent ??
      (parseInt(process.env["PER_HOST_MAX_CONCURRENT"] ?? "", 10) ||
        DEFAULT_PER_HOST_MAX_CONCURRENT);
    this.minGapMs =
      opts?.minGapMs ??
      (parseInt(process.env["PER_HOST_MIN_GAP_MS"] ?? "", 10) ||
        DEFAULT_PER_HOST_MIN_GAP_MS);
    this.hostGapMs = new Map(Object.entries(opts?.hostGapMs ?? {}));
  }

  async run<T>(hostname: string, fn: () => Promise<T>): Promise<T> {
    let sem = this.semaphores.get(hostname);
    if (!sem) {
      sem = new Semaphore(this.maxConcurrent);
      this.semaphores.set(hostname, sem);
    }

    const release = await sem.acquire();

    // Enforce min gap between successive requests to same host (per-host override wins).
    const gap = this.hostGapMs.get(hostname) ?? this.minGapMs;
    const last = this.lastFinished.get(hostname) ?? 0;
    const now = Date.now();
    const elapsed = now - last;
    if (elapsed < gap) {
      await new Promise<void>(r => setTimeout(r, gap - elapsed));
    }

    try {
      return await fn();
    } finally {
      this.lastFinished.set(hostname, Date.now());
      release();
    }
  }
}

// ---------------------------------------------------------------------------
// Shared whisper semaphore
// ---------------------------------------------------------------------------

/** Shared semaphore for Whisper transcription — limits CPU-bound concurrency. */
export const whisperSemaphore = new Semaphore(
  parseInt(process.env["WHISPER_CONCURRENCY"] ?? "", 10) || DEFAULT_WHISPER_CONCURRENCY,
);
