import { describe, it, expect } from "vitest";
import { codecExtension, NARRATION_CODEC } from "./kokoro.js";

describe("codec selection", () => {
  it("maps codecs to their file extensions", () => {
    expect(codecExtension("mp3")).toBe("mp3");
    expect(codecExtension("opus")).toBe("opus");
  });

  it("defaults to opus unless NARRATION_CODEC=mp3", () => {
    // The module reads NARRATION_CODEC at import time; in the test env the var is
    // unset, so the default must be opus (the smaller file — what we ship).
    const expected = process.env["NARRATION_CODEC"] === "mp3" ? "mp3" : "opus";
    expect(NARRATION_CODEC).toBe(expected);
    if (!process.env["NARRATION_CODEC"]) expect(NARRATION_CODEC).toBe("opus");
  });
});
