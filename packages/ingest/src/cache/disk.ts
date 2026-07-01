/**
 * Content-addressed on-disk cache. Each entry is a single JSON file named by
 * its cache key under a namespace directory (e.g. `.cache/ingest/transcripts/`).
 *
 * Design invariants:
 *   - **Content-addressed + safe to delete.** A missing/corrupt/schema-invalid
 *     entry is a cache MISS, never an error. A cold cache just does full work.
 *   - **Validated on read.** Every entry is parsed through a zod schema, so a
 *     stale on-disk shape from an older version degrades to a miss rather than
 *     poisoning the pipeline.
 *   - **IO stays thin.** All the interesting logic (keying, validation, stats)
 *     is here and unit-tested; the network/transcription layers only call
 *     `get`/`set`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";

/** Shared hit/miss counters, aggregated across every cache namespace in a run. */
export class CacheStats {
  private hits = 0;
  private misses = 0;

  hit(): void {
    this.hits++;
  }
  miss(): void {
    this.misses++;
  }
  snapshot(): { hits: number; misses: number } {
    return { hits: this.hits, misses: this.misses };
  }
}

export class DiskCache<T> {
  constructor(
    private readonly dir: string,
    private readonly schema: z.ZodType<T>,
    private readonly stats: CacheStats,
  ) {}

  /** Absolute path of the entry file for `key` (does not create anything). */
  pathFor(key: string): string {
    return join(this.dir, `${key}.json`);
  }

  /**
   * Read a cached value. Returns undefined (a MISS) when the file is absent,
   * unreadable, not JSON, or fails schema validation.
   */
  get(key: string): T | undefined {
    const path = this.pathFor(key);
    if (!existsSync(path)) {
      this.stats.miss();
      return undefined;
    }
    try {
      const parsed = this.schema.safeParse(JSON.parse(readFileSync(path, "utf8")));
      if (!parsed.success) {
        this.stats.miss();
        return undefined;
      }
      this.stats.hit();
      return parsed.data;
    } catch {
      this.stats.miss();
      return undefined;
    }
  }

  /** Write a value. Best-effort: an IO failure is swallowed (cache is optional). */
  set(key: string, value: T): void {
    try {
      mkdirSync(this.dir, { recursive: true });
      writeFileSync(this.pathFor(key), JSON.stringify(value));
    } catch {
      // A cache that can't be written just means the next run does full work.
    }
  }
}
