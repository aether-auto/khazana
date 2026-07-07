import { describe, expect, test } from "vitest";
import { WORKSHOP_BROWSE_CHANNELS } from "@khazana/core";
import { makerChannelStyle, MAKER_CHANNEL_STYLE_ENTRIES } from "./maker-channel-style.js";

describe("makerChannelStyle — centralized per-maker-channel identity", () => {
  test("every canonical Workshop browse channel has a color + a 3-char uppercase mono code", () => {
    for (const channel of WORKSHOP_BROWSE_CHANNELS) {
      const s = makerChannelStyle(channel);
      expect(s.color.length).toBeGreaterThan(0);
      // Alphanumeric — "3d-printing" earns the natural "3DP" code, digit included.
      expect(s.code).toMatch(/^[A-Z0-9]{3}$/);
    }
  });

  test("codes are unique across all maker channels (each reads as distinct at a glance)", () => {
    const codes = WORKSHOP_BROWSE_CHANNELS.map((c) => makerChannelStyle(c).code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("colors are unique across all maker channels", () => {
    const colors = WORKSHOP_BROWSE_CHANNELS.map((c) => makerChannelStyle(c).color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  test("colors are built ONLY from existing design tokens — var()/color-mix(), never a raw hex", () => {
    for (const channel of WORKSHOP_BROWSE_CHANNELS) {
      const { color } = makerChannelStyle(channel);
      expect(color).toMatch(/^(var\(--[\w-]+\)|color-mix\(in oklab,.*\))$/);
      expect(color).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });

  test("an unrecognized channel falls back to a neutral, non-crashing style", () => {
    const s = makerChannelStyle("not-a-real-channel");
    expect(s.color).toBe("var(--ink-faint)");
    expect(s.code).toBe("———");
  });

  test("MAKER_CHANNEL_STYLE_ENTRIES covers every canonical channel exactly once, in canonical order", () => {
    expect(MAKER_CHANNEL_STYLE_ENTRIES.map(([name]) => name)).toEqual(WORKSHOP_BROWSE_CHANNELS);
  });
});
