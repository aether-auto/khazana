/**
 * Structured per-source fetch results for the downstream verifier (Wave 2).
 *
 * The ingest run emits one of these per source so a later verification pass can
 * strike-count correctly. We only CLASSIFY here — the strike/status/prune logic
 * is intentionally NOT built in this wave. Classification rules:
 *
 *   permanent  : dns · http 404/410 · not-a-feed
 *   transient  : http 429 · http 5xx · timeout · network
 *
 * `errorKind: "ok"` is used for successful fetches.
 */

/** Cause categories for a source fetch. */
export type FetchErrorKind =
  | "dns"
  | "timeout"
  | "http-4xx"
  | "http-5xx"
  | "not-a-feed"
  | "network"
  | "ok";

export interface SourceFetchResult {
  sourceId: string;
  ok: boolean;
  httpStatus?: number;
  errorKind: FetchErrorKind;
  itemCount: number;
  finalUrl?: string;
}

/** Build an OK result. */
export function classifyOk(
  sourceId: string,
  itemCount: number,
  finalUrl?: string,
): SourceFetchResult {
  return {
    sourceId,
    ok: true,
    httpStatus: 200,
    errorKind: "ok",
    itemCount,
    ...(finalUrl ? { finalUrl } : {}),
  };
}

/** Extract an HTTP status code from an error message like "id: HTTP 404". */
function statusFromMessage(msg: string): number | undefined {
  const m = msg.match(/HTTP\s+(\d{3})/i);
  return m ? parseInt(m[1]!, 10) : undefined;
}

/**
 * Classify a thrown fetch error into a `SourceFetchResult`. Inspects the error
 * message for an HTTP status, DNS/timeout/reset signatures, and feed-parse
 * failures. Falls back to a transient "network" kind.
 */
export function classifyError(sourceId: string, err: unknown): SourceFetchResult {
  const msg = err instanceof Error ? err.message : String(err);
  const base = { sourceId, ok: false as const, itemCount: 0 };

  const status = statusFromMessage(msg);
  if (status !== undefined) {
    const kind: FetchErrorKind = status >= 500 ? "http-5xx" : "http-4xx";
    return { ...base, httpStatus: status, errorKind: kind };
  }

  // DNS resolution failures (permanent — the host doesn't resolve).
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(msg)) {
    return { ...base, errorKind: "dns" };
  }

  // Timeouts (transient).
  if (/timed out|timeout|ETIMEDOUT|ESOCKETTIMEDOUT/i.test(msg)) {
    return { ...base, errorKind: "timeout" };
  }

  // Feed-parse failures — a 200 that isn't valid RSS/Atom (permanent).
  if (/not recognized as RSS or Atom|not a feed|Feed not recognized|Unexpected (?:end|close) of|Non-whitespace before first tag/i.test(msg)) {
    return { ...base, errorKind: "not-a-feed" };
  }

  // Anything else — connection resets, TLS, etc. (transient).
  return { ...base, errorKind: "network" };
}

/**
 * True when a result represents a PERMANENT failure (safe to strike toward
 * pruning): DNS, not-a-feed, or a 404/410. 429/5xx/timeout/network are
 * transient and must NOT be treated as permanent.
 */
export function isPermanent(r: SourceFetchResult): boolean {
  if (r.ok) return false;
  if (r.errorKind === "dns" || r.errorKind === "not-a-feed") return true;
  if (r.errorKind === "http-4xx") return r.httpStatus === 404 || r.httpStatus === 410;
  return false;
}
