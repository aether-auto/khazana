import { expect, test } from "vitest";
import { CHANNELS, ChannelSchema, SourceTypeSchema, FormatNameSchema } from "./vocab.js";

test("channels include the founder's core topics", () => {
  for (const c of ["history", "geopolitics", "ai", "quantum", "ds-sports", "finance"]) {
    expect(CHANNELS).toContain(c);
  }
});

test("ChannelSchema accepts known and rejects unknown", () => {
  expect(ChannelSchema.parse("finance")).toBe("finance");
  expect(ChannelSchema.safeParse("astrology").success).toBe(false);
});

test("source types and format names validate", () => {
  expect(SourceTypeSchema.parse("eng-blog")).toBe("eng-blog");
  expect(FormatNameSchema.parse("chronicle")).toBe("chronicle");
  expect(FormatNameSchema.safeParse("haiku").success).toBe(false);
});
