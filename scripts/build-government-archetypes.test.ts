import { describe, expect, test } from "vitest";
import { validateLibraryObject } from "./validate-government-archetypes.mts";
import { serializeLibrary } from "./build-government-archetypes.mts";

describe("serializeLibrary", () => {
  test("produces a library that passes the full semantic validator (never publishes invalid data)", () => {
    const json = serializeLibrary();
    const result = validateLibraryObject(JSON.parse(json));
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  test("is pretty-printed JSON with a trailing newline", () => {
    const json = serializeLibrary();
    expect(json.endsWith("\n")).toBe(true);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});
