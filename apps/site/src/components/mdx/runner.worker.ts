/// <reference lib="webworker" />
import { formatValue, formatLogArgs, type RunRequest, type WorkerResponse } from "./lib/runner-protocol.js";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<RunRequest>) => {
  const req = e.data;
  if (!req || req.kind !== "run") return;

  const logs: string[] = [];
  const capture = (...args: unknown[]) => logs.push(formatLogArgs(args));
  // sandbox-ish console: only capture; no access to the real one.
  const sandboxConsole = { log: capture, info: capture, warn: capture, error: capture, debug: capture };

  const start = Date.now();
  let value: string | null = null;
  let error: string | null = null;

  try {
    // Wrap user code so a trailing expression is returned, and inject our console.
    // No imports, no fetch in worker scope for v1 (kept minimal/offline).
    const fn = new Function(
      "console",
      `"use strict";\nreturn (async () => {\n${req.code}\n})();`,
    );
    const result = await fn(sandboxConsole);
    if (result !== undefined) value = formatValue(result);
  } catch (err) {
    error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  }

  const res: WorkerResponse = {
    kind: "result",
    id: req.id,
    logs,
    value,
    error,
    ms: Date.now() - start,
  };
  ctx.postMessage(res);
};
