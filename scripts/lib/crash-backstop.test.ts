import { afterEach, describe, expect, test, vi } from "vitest";
import {
  handleFatalError,
  installCrashBackstop,
  isUndiciParserAssert,
  type FatalErrorDeps,
} from "./crash-backstop.mts";
import type { FeedItem } from "../../packages/core/src/index.ts";

const ITEM: FeedItem = {
  id: "rss:https://a.com/1",
  source: "a",
  sourceType: "rss",
  url: "https://a.com/1",
  title: "Hello",
  publishedAt: "2026-07-07T00:00:00.000Z",
  fetchedAt: "2026-07-07T00:00:00.000Z",
  topics: ["tech"],
  entities: [],
  summary: "",
  media: [],
  trustScore: 0.6,
  kind: "link",
};

function makeUndiciAssertError(): Error {
  const err = new Error("false == true");
  err.name = "AssertionError";
  err.stack =
    "AssertionError [ERR_ASSERTION]: false == true\n" +
    "    at Parser.finish (node:internal/deps/undici/undici:6157:9)\n" +
    "    at TLSSocket.<anonymous> (node:internal/deps/undici/undici:6491:36)\n" +
    "    at endReadableNT (node:internal/streams/readable:1400:12)";
  return err;
}

describe("isUndiciParserAssert", () => {
  test("recognizes the undici Parser.finish AssertionError shape", () => {
    expect(isUndiciParserAssert(makeUndiciAssertError())).toBe(true);
  });

  test("does not misclassify an ordinary error", () => {
    expect(isUndiciParserAssert(new Error("network down"))).toBe(false);
  });

  test("does not misclassify a same-named AssertionError from unrelated code", () => {
    const err = new Error("expected 1 to equal 2");
    err.name = "AssertionError";
    expect(isUndiciParserAssert(err)).toBe(false);
  });

  test("never throws on a non-Error value", () => {
    expect(isUndiciParserAssert("boom")).toBe(false);
    expect(isUndiciParserAssert(undefined)).toBe(false);
  });
});

describe("handleFatalError", () => {
  function makeDeps(overrides: Partial<FatalErrorDeps> = {}): {
    deps: FatalErrorDeps;
    logs: string[];
    written: FeedItem[][];
    exitCode: number[];
  } {
    const logs: string[] = [];
    const written: FeedItem[][] = [];
    const exitCode: number[] = [];
    const deps: FatalErrorDeps = {
      getSalvageItems: () => null,
      writeFeed: (items) => written.push(items),
      log: (line) => logs.push(line),
      exit: (code) => exitCode.push(code),
      source: "uncaughtException",
      ...overrides,
    };
    return { deps, logs, written, exitCode };
  }

  test("salvages pre-enrich items, writes the feed, and exits 0 (partial-but-fresh beats total loss)", () => {
    const { deps, logs, written, exitCode } = makeDeps({
      getSalvageItems: () => [ITEM],
    });
    handleFatalError(makeUndiciAssertError(), deps);

    expect(written).toEqual([[ITEM]]);
    expect(exitCode).toEqual([0]);
    expect(logs.some((l) => l.startsWith("::error::") && l.includes("undici"))).toBe(true);
    expect(logs.some((l) => l.startsWith("::warning::") && l.includes("SALVAGED"))).toBe(true);
  });

  test("labels the undici parser-assert class explicitly in the annotation", () => {
    const { deps, logs } = makeDeps({ getSalvageItems: () => [ITEM] });
    handleFatalError(makeUndiciAssertError(), deps);
    expect(logs[0]).toContain("Node/undici HTTP-parser AssertionError");
  });

  test("labels an unrelated fatal error as unclassified, still salvages", () => {
    const { deps, logs, exitCode } = makeDeps({ getSalvageItems: () => [ITEM] });
    handleFatalError(new Error("out of memory"), deps);
    expect(logs[0]).toContain("unclassified fatal error");
    expect(exitCode).toEqual([0]);
  });

  test("exits 1 with a clear, non-cryptic message when nothing was salvageable", () => {
    const { deps, logs, written, exitCode } = makeDeps({ getSalvageItems: () => null });
    handleFatalError(makeUndiciAssertError(), deps);

    expect(written).toEqual([]);
    expect(exitCode).toEqual([1]);
    expect(logs.some((l) => l.includes("no salvageable items were captured"))).toBe(true);
  });

  test("exits 1 when getSalvageItems returns an empty array (nothing collected yet)", () => {
    const { deps, exitCode } = makeDeps({ getSalvageItems: () => [] });
    handleFatalError(makeUndiciAssertError(), deps);
    expect(exitCode).toEqual([1]);
  });

  test("a throwing getSalvageItems is treated as no-salvage, never throws itself", () => {
    const { deps, exitCode } = makeDeps({
      getSalvageItems: () => {
        throw new Error("boom");
      },
    });
    expect(() => handleFatalError(makeUndiciAssertError(), deps)).not.toThrow();
    expect(exitCode).toEqual([1]);
  });

  test("a throwing writeFeed still exits (1), logging the salvage-write failure instead of losing control", () => {
    const { deps, exitCode, logs } = makeDeps({
      getSalvageItems: () => [ITEM],
      writeFeed: () => {
        throw new Error("disk full");
      },
    });
    handleFatalError(makeUndiciAssertError(), deps);
    expect(exitCode).toEqual([1]);
    expect(logs.some((l) => l.includes("salvage write itself failed"))).toBe(true);
  });
});

describe("installCrashBackstop", () => {
  afterEach(() => {
    process.removeAllListeners("uncaughtException");
    process.removeAllListeners("unhandledRejection");
  });

  test("registers exactly one uncaughtException and one unhandledRejection listener", () => {
    const before = {
      unc: process.listenerCount("uncaughtException"),
      unh: process.listenerCount("unhandledRejection"),
    };
    installCrashBackstop({ getSalvageItems: () => null, writeFeed: () => {} });
    expect(process.listenerCount("uncaughtException")).toBe(before.unc + 1);
    expect(process.listenerCount("unhandledRejection")).toBe(before.unh + 1);
  });

  test("the installed handler logs via console.error and exits via process.exit on a fatal error", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as unknown as typeof process.exit);

    installCrashBackstop({ getSalvageItems: () => [ITEM], writeFeed: () => {} });
    const listeners = process.listeners("uncaughtException") as Array<(err: unknown) => void>;
    const handler = listeners[listeners.length - 1];
    expect(handler).toBeDefined();
    handler?.(makeUndiciAssertError());

    expect(errorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
