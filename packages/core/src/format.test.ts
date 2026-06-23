import { expect, test } from "vitest";
import { FORMATS, formatsForChannel } from "./format.js";

test("all six v1 formats are present and valid", () => {
  expect(Object.keys(FORMATS).sort()).toEqual(
    ["build-log", "chronicle", "dispatch", "field-notes", "primer", "teardown"],
  );
  expect(FORMATS.chronicle.intent).toBe("narrate");
  expect(FORMATS["field-notes"].length).toBe("brief");
});

test("chronicle is recurring (Sunday column) and matches history", () => {
  expect(FORMATS.chronicle.series?.cadence).toBe("weekly");
  expect(formatsForChannel("history").map((f) => f.name)).toContain("chronicle");
});
