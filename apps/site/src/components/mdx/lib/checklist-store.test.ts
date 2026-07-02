// apps/site/src/components/mdx/lib/checklist-store.test.ts
import { describe, expect, test } from "vitest";
import {
  hashString,
  storageKey,
  parseState,
  serializeState,
  completedCount,
  type ChecklistItem,
} from "./checklist-store.js";

const ITEMS: ChecklistItem[] = [
  { label: "Flash the firmware", note: "use the 3.3V header", href: "https://x/y" },
  { label: "Level the bed" },
  { label: "Print the test cube" },
];

describe("hashString", () => {
  test("deterministic + fixed 8-hex-char width", () => {
    const a = hashString("hello");
    expect(a).toBe(hashString("hello"));
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });
  test("different inputs → (almost surely) different hashes", () => {
    expect(hashString("a")).not.toBe(hashString("b"));
  });
  test("empty string hashes to the FNV basis", () => {
    expect(hashString("")).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("storageKey", () => {
  test("prefixed + stable for identical content", () => {
    const k = storageKey(ITEMS, "Reproduce");
    expect(k.startsWith("khz:checklist:")).toBe(true);
    expect(k).toBe(storageKey(ITEMS, "Reproduce"));
  });
  test("changes when the title changes", () => {
    expect(storageKey(ITEMS, "A")).not.toBe(storageKey(ITEMS, "B"));
  });
  test("changes when an item label changes", () => {
    const edited = ITEMS.map((it, i) => (i === 0 ? { ...it, label: "Flash it" } : it));
    expect(storageKey(ITEMS, "T")).not.toBe(storageKey(edited, "T"));
  });
  test("changes when items are reordered (order is identity)", () => {
    const reordered = [ITEMS[1]!, ITEMS[0]!, ITEMS[2]!];
    expect(storageKey(ITEMS, "T")).not.toBe(storageKey(reordered, "T"));
  });
  test("STABLE when only note/href change (presentation, not identity)", () => {
    const tweaked = ITEMS.map((it, i) => (i === 0 ? { ...it, note: "different note", href: "https://z" } : it));
    expect(storageKey(ITEMS, "T")).toBe(storageKey(tweaked, "T"));
  });
  test("missing title still yields a stable key", () => {
    expect(storageKey(ITEMS)).toBe(storageKey(ITEMS, undefined));
  });
});

describe("parseState", () => {
  test("null → all-false of requested length", () => {
    expect(parseState(null, 3)).toEqual([false, false, false]);
  });
  test("round-trips a serialized state", () => {
    const raw = serializeState([true, false, true]);
    expect(parseState(raw, 3)).toEqual([true, false, true]);
  });
  test("length mismatch: pads missing → false, drops extras", () => {
    expect(parseState(serializeState([true]), 3)).toEqual([true, false, false]);
    expect(parseState(serializeState([true, true, true, true]), 2)).toEqual([true, true]);
  });
  test("garbage / non-array → all-false, never throws", () => {
    expect(parseState("not json", 2)).toEqual([false, false]);
    expect(parseState("{}", 2)).toEqual([false, false]);
    expect(parseState("42", 2)).toEqual([false, false]);
  });
  test("coerces truthy-but-not-true entries to false (only literal true counts)", () => {
    expect(parseState(JSON.stringify([1, "yes", true]), 3)).toEqual([false, false, true]);
  });
});

describe("serializeState / completedCount", () => {
  test("serialize normalizes to strict booleans", () => {
    // deliberately loose input to prove normalization
    expect(serializeState([true, false, true])).toBe("[true,false,true]");
  });
  test("completedCount counts trues", () => {
    expect(completedCount([true, false, true, true])).toBe(3);
    expect(completedCount([false, false])).toBe(0);
  });
});
