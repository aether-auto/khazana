// apps/site/src/components/mdx/lib/runner-protocol.ts
/** Pure message protocol + output formatter for <RunnableCode>. No DOM, no worker. */

export interface RunRequest {
  kind: "run";
  id: string;
  code: string;
}

export interface WorkerResponse {
  kind: "result";
  id: string;
  /** formatted console.* lines, in order */
  logs: string[];
  /** formatted return/last-expression value (or null if none) */
  value: string | null;
  /** error message string, or null on success */
  error: string | null;
  /** wall-clock ms in the worker */
  ms: number;
}

export function makeRunRequest(code: string, id: string): RunRequest {
  return { kind: "run", id, code };
}

/** Format a single value for display. Safe against circular refs and functions. */
export function formatValue(v: unknown): string {
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  const t = typeof v;
  if (t === "string") return JSON.stringify(v);
  if (t === "number" || t === "boolean" || t === "bigint") return String(v);
  if (t === "function") {
    const name = (v as { name?: string }).name;
    return `ƒ ${name || "(anonymous)"}`;
  }
  if (t === "symbol") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return "[circular or non-serializable object]";
  }
}

/**
 * Format a single value for console.log-style display.
 * Strings are printed without quotes (matching browser console behavior).
 */
function formatLogArg(v: unknown): string {
  if (typeof v === "string") return v; // console.log("x =", ...) prints without quotes
  return formatValue(v);
}

/** Join console.log-style varargs with spaces, formatting each. */
export function formatLogArgs(args: ReadonlyArray<unknown>): string {
  return args.map(formatLogArg).join(" ");
}

/** Narrow an unknown postMessage payload to a WorkerResponse, or throw. */
export function parseWorkerMessage(data: unknown): WorkerResponse {
  if (
    typeof data === "object" &&
    data !== null &&
    (data as { kind?: unknown }).kind === "result" &&
    Array.isArray((data as { logs?: unknown }).logs)
  ) {
    return data as WorkerResponse;
  }
  throw new Error("RunnableCode: malformed worker message");
}
