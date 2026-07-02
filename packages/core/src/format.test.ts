import { expect, test } from "vitest";
import { FORMATS, formatsForChannel } from "./format.js";

test("all v1 formats are present and valid", () => {
  expect(Object.keys(FORMATS).sort()).toEqual(
    ["build-log", "chronicle", "dispatch", "field-notes", "primer", "teardown", "theater"],
  );
  expect(FORMATS.chronicle.intent).toBe("narrate");
  expect(FORMATS["field-notes"].length).toBe("brief");
});

test("chronicle is recurring (Sunday column) and matches history", () => {
  expect(FORMATS.chronicle.series?.cadence).toBe("weekly");
  expect(formatsForChannel("history").map((f) => f.name)).toContain("chronicle");
});

test("theater narrates military/strategic history at feature length", () => {
  expect(FORMATS.theater.intent).toBe("narrate");
  expect(FORMATS.theater.length).toBe("feature");
  // The military kit is theater's spine.
  expect(FORMATS.theater.componentKit).toContain("BattleMap");
  // Discoverable from the military/strategy channels.
  expect(formatsForChannel("history").map((f) => f.name)).toContain("theater");
  expect(formatsForChannel("geopolitics").map((f) => f.name)).toContain("theater");
});
