import { describe, it, expect } from "vitest";
import {
  voiceForChannels,
  NARRATION_VOICES,
  DEFAULT_VOICE,
  STORY_VOICE,
  STORY_CHANNELS,
  findVoice,
} from "./voices.js";

describe("voiceForChannels", () => {
  it("picks bm_fable for any story channel", () => {
    expect(voiceForChannels(["history"])).toBe("bm_fable");
    expect(voiceForChannels(["geopolitics"])).toBe("bm_fable");
    expect(voiceForChannels(["politics"])).toBe("bm_fable");
    expect(voiceForChannels(["geography"])).toBe("bm_fable");
  });

  it("picks am_onyx (default) for non-story channels", () => {
    expect(voiceForChannels(["finance", "data-science"])).toBe("am_onyx");
    expect(voiceForChannels(["tech"])).toBe("am_onyx");
    expect(voiceForChannels(["ai", "quantum"])).toBe("am_onyx");
  });

  it("lets a story channel win in a mixed list", () => {
    expect(voiceForChannels(["finance", "history"])).toBe("bm_fable");
    expect(voiceForChannels(["history", "finance"])).toBe("bm_fable");
  });

  it("defaults to am_onyx for empty or unknown channels", () => {
    expect(voiceForChannels([])).toBe("am_onyx");
    expect(voiceForChannels(["not-a-real-channel"])).toBe("am_onyx");
  });

  it("the flagship (finance/data-science) gets am_onyx", () => {
    expect(voiceForChannels(["finance", "data-science"])).toBe("am_onyx");
  });
});

describe("cast catalog", () => {
  it("contains exactly the two voices (af_heart removed)", () => {
    expect(NARRATION_VOICES.map((v) => v.voice)).toEqual(["bm_fable", "am_onyx"]);
    expect(NARRATION_VOICES.some((v) => v.voice === "af_heart")).toBe(false);
  });

  it("DEFAULT_VOICE is am_onyx and STORY_VOICE is bm_fable, both in the cast", () => {
    expect(DEFAULT_VOICE).toBe("am_onyx");
    expect(STORY_VOICE).toBe("bm_fable");
    expect(findVoice(DEFAULT_VOICE)).toBeDefined();
    expect(findVoice(STORY_VOICE)).toBeDefined();
  });

  it("STORY_CHANNELS is the four narrative channels", () => {
    expect([...STORY_CHANNELS].sort()).toEqual(
      ["geography", "geopolitics", "history", "politics"].sort(),
    );
  });
});
