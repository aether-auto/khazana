import { describe, it, expect } from "vitest";
import { codecExtension, NARRATION_CODEC } from "./kokoro.js";

describe("codec selection", () => {
  it("maps codecs to their file extensions", () => {
    expect(codecExtension("mp3")).toBe("mp3");
    expect(codecExtension("opus")).toBe("opus");
  });

  it("defaults to mp3 unless NARRATION_CODEC=opus", () => {
    // The module reads NARRATION_CODEC at import time; in the test env the var is
    // unset, so the default must be mp3 (plays in every browser incl. Safari).
    const expected = process.env["NARRATION_CODEC"] === "opus" ? "opus" : "mp3";
    expect(NARRATION_CODEC).toBe(expected);
    if (!process.env["NARRATION_CODEC"]) expect(NARRATION_CODEC).toBe("mp3");
  });
});
