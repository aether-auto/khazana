import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  classifyError as ingestClassifyError,
  conditionalFetch as ingestConditionalFetch,
  isPermanent as ingestIsPermanent,
  makeCaches as ingestMakeCaches,
} from "@khazana/ingest";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
  classifyError,
  conditionalFetch,
  isPermanent,
  makeCaches,
} from "./http.js";
import {
  conditionalFetch as barrelConditionalFetch,
  loadWorldRegistry,
} from "./index.js";

let cacheDir: string;

beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), "khazana-world-http-"));
});

afterEach(() => {
  rmSync(cacheDir, { recursive: true, force: true });
});

function response(status: number, headers: Record<string, string>) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    text: async () => "",
    json: async () => ({}),
  };
}

test("re-exports ingest HTTP bindings without wrappers", () => {
  expect(conditionalFetch).toBe(ingestConditionalFetch);
  expect(makeCaches).toBe(ingestMakeCaches);
  expect(classifyError).toBe(ingestClassifyError);
  expect(isPermanent).toBe(ingestIsPermanent);
});

test("public barrel exports HTTP and registry modules", () => {
  expect(barrelConditionalFetch).toBe(ingestConditionalFetch);
  expect(loadWorldRegistry).toBeTypeOf("function");
});

test("re-exported conditional fetch retains cached validators and 304 behavior", async () => {
  const caches = makeCaches(cacheDir);
  await conditionalFetch(
    async () => response(200, { etag: '"version-1"' }),
    "https://example.com/world-feed",
    {},
    caches.http,
  );

  let conditionalHeaders: Record<string, string> | undefined;
  const result = await conditionalFetch(
    async (_url, init) => {
      conditionalHeaders = init?.headers;
      return response(304, {});
    },
    "https://example.com/world-feed",
    {},
    caches.http,
  );

  expect(conditionalHeaders?.["If-None-Match"]).toBe('"version-1"');
  expect(result).toEqual({ notModified: true });
});

test("re-exported error classifier keeps 404 permanent and 503 transient", () => {
  expect(isPermanent(classifyError("world-source", new Error("HTTP 404")))).toBe(true);
  expect(isPermanent(classifyError("world-source", new Error("HTTP 503")))).toBe(false);
});
