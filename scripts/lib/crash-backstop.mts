/**
 * Crash backstop for scripts/real-ingest.mts.
 *
 * INCIDENT: a live `feed-refresh` run crashed the whole ~720-source ingest
 * process with `AssertionError [ERR_ASSERTION]: false == true` thrown from
 * inside Node's built-in undici HTTP client (`Parser.finish` off a
 * `TLSSocket` event). That is a known Node/undici bug where a malformed HTTP
 * response trips the parser's internal assert — and because it fires
 * asynchronously from a raw socket event, NO try/catch wrapped around any
 * individual `fetch()` call can stop it. It surfaces only as an uncaught
 * exception at the process level, killing every source's work in one shot.
 * (The root trigger — a burst of undici `fetch()` calls fired by YouTube
 * discovery items during enrichment — is cut at the source in
 * `packages/ingest/src/youtube.ts` / `youtube-discovery.ts`; THIS module is
 * defense-in-depth so no *other* rogue response can ever nuke a run again.)
 *
 * Deliberately pure/injectable: `handleFatalError` takes every side effect
 * (log/exit/write) as a dependency so the salvage decision and logging can be
 * unit-tested without crashing a real process or touching disk.
 * `installCrashBackstop` is the thin real-`process` wiring that
 * `real-ingest.mts` calls once, early, before `runIngest` starts.
 */
import type { FeedItem } from "../../packages/core/src/index.ts";

/**
 * Recognizes the specific Node/undici HTTP-parser assertion crash class by
 * message/stack shape, purely so the log/annotation can name it precisely.
 * Never throws; returns false for anything that isn't a clear match (an
 * unrecognized fatal error still gets salvaged/logged — this only affects
 * the label).
 */
export function isUndiciParserAssert(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name !== "AssertionError") return false;
  const text = `${err.message} ${err.stack ?? ""}`;
  return /undici/i.test(text) && /Parser\.finish|false == true/.test(text);
}

export interface FatalErrorDeps {
  /** Returns the last pre-enrich items snapshot, or null if none was ever captured. */
  getSalvageItems: () => FeedItem[] | null;
  /** Persist the salvaged raw feed (real-ingest.mts wires this to writeFeed(dataDir, items)). */
  writeFeed: (items: FeedItem[]) => void;
  /** Line-oriented logger (real-ingest.mts wires this to console.error). */
  log: (line: string) => void;
  /** Process exit (real-ingest.mts wires this to process.exit). */
  exit: (code: number) => void;
  /** Which process-level event produced this call, for the log line only. */
  source: "uncaughtException" | "unhandledRejection";
}

/**
 * Handle a fatal error that would otherwise crash the process with a cryptic
 * dump and zero output. ALWAYS logs a loud, clearly-labeled GitHub Actions
 * annotation first (so the run's Actions summary surfaces it, not just a
 * buried stack trace), then:
 *
 *   - if pre-enrich items were captured (source-fetch fully completed before
 *     the crash), persists them via `writeFeed` and exits 0 — partial-but-
 *     fresh beats total loss: a run that collected every source's raw items
 *     but died mid-enrichment still ships a feed;
 *   - otherwise exits 1 with a clearly-labeled, non-cryptic message (nothing
 *     was salvageable — the crash happened before source-fetch finished).
 *
 * Never throws.
 */
export function handleFatalError(err: unknown, deps: FatalErrorDeps): void {
  const undici = isUndiciParserAssert(err);
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  const klass = undici
    ? "Node/undici HTTP-parser AssertionError (known Node bug; thrown asynchronously off a socket event — no try/catch around a fetch() call can stop it)"
    : "unclassified fatal error";

  deps.log(`::error::[real-ingest] FATAL (${deps.source}) — ${klass}`);
  deps.log(`[real-ingest] ${message}`);

  let items: FeedItem[] | null = null;
  try {
    items = deps.getSalvageItems();
  } catch {
    items = null;
  }

  if (items && items.length > 0) {
    try {
      deps.writeFeed(items);
      deps.log(
        `::warning::[real-ingest] SALVAGED ${items.length} pre-enrichment item(s) after a fatal ` +
          `${deps.source} — raw feed written, but full-text/transcript enrichment and curation did ` +
          `NOT run this cycle. Partial-but-fresh beats total loss; investigate the crash above before ` +
          `the next scheduled run.`,
      );
      deps.exit(0);
      return;
    } catch (writeErr) {
      deps.log(
        `::error::[real-ingest] salvage write itself failed: ` +
          `${writeErr instanceof Error ? writeErr.message : String(writeErr)}`,
      );
    }
  } else {
    deps.log(
      `::error::[real-ingest] no salvageable items were captured before the crash (it happened before ` +
        `source-fetch finished collecting the feed) — controlled exit, no partial output possible.`,
    );
  }
  deps.exit(1);
}

/**
 * Wire `handleFatalError` to the real `process` events. Call once, as early
 * as possible in `real-ingest.mts` (before `runIngest` starts) so no async
 * failure window during the run is left uncovered.
 */
export function installCrashBackstop(opts: {
  getSalvageItems: () => FeedItem[] | null;
  writeFeed: (items: FeedItem[]) => void;
}): void {
  const onFatal =
    (source: "uncaughtException" | "unhandledRejection") =>
    (err: unknown): void => {
      handleFatalError(err, {
        getSalvageItems: opts.getSalvageItems,
        writeFeed: opts.writeFeed,
        log: (line) => console.error(line),
        exit: (code) => process.exit(code),
        source,
      });
    };
  process.on("uncaughtException", onFatal("uncaughtException"));
  process.on("unhandledRejection", onFatal("unhandledRejection"));
}
