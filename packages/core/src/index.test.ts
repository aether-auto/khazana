import { expect, test } from "vitest";
import { FundingRelationshipSchema, KHAZANA_CORE_VERSION } from "./index.js";

test("core package is importable", () => {
  expect(KHAZANA_CORE_VERSION).toBe("0.0.0");
});

test("FundingRelationshipSchema exported from root", () => {
  expect(FundingRelationshipSchema).toBeDefined();
});
