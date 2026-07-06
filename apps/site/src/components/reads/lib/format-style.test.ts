import { describe, expect, test } from "vitest";
import { FORMAT_NAMES } from "@khazana/core";
import { formatStyle, FORMAT_STYLE_ENTRIES } from "./format-style.js";

describe("formatStyle — centralized per-format identity", () => {
  test("every canonical format has a color + a 3-letter uppercase code", () => {
    for (const name of FORMAT_NAMES) {
      const s = formatStyle(name);
      expect(s.color.length).toBeGreaterThan(0);
      expect(s.code).toMatch(/^[A-Z]{3}$/);
    }
  });

  test("codes are unique across all formats (each format reads as distinct)", () => {
    const codes = FORMAT_NAMES.map((n) => formatStyle(n).code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("colors are unique across all formats", () => {
    const colors = FORMAT_NAMES.map((n) => formatStyle(n).color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  test("colors are built ONLY from existing design tokens — var()/color-mix(), never a raw hex", () => {
    for (const name of FORMAT_NAMES) {
      const { color } = formatStyle(name);
      expect(color).toMatch(/^(var\(--[\w-]+\)|color-mix\(in oklab,.*\))$/);
      expect(color).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });

  test("an unrecognized format falls back to a neutral, non-crashing style", () => {
    const s = formatStyle("not-a-real-format");
    expect(s.color).toBe("var(--ink-faint)");
    expect(s.code).toBe("———");
  });

  test("FORMAT_STYLE_ENTRIES covers every canonical format exactly once, in canonical order", () => {
    expect(FORMAT_STYLE_ENTRIES.map(([name]) => name)).toEqual(FORMAT_NAMES);
  });
});
