import { describe, expect, test } from "vitest";
import { excerptFromHtml } from "./build-excerpt.js";

describe("excerptFromHtml", () => {
  test("empty/undefined body → empty excerpt", () => {
    expect(excerptFromHtml(undefined)).toBe("");
    expect(excerptFromHtml("")).toBe("");
  });

  test("strips HTML tags and collapses whitespace", () => {
    const html = "<p>Solder the  <strong>ESP32</strong>\n\nto the board.</p>";
    expect(excerptFromHtml(html)).toBe("Solder the ESP32 to the board.");
  });

  test("short prose is returned in full, no truncation marker", () => {
    const html = "<p>A short build note.</p>";
    expect(excerptFromHtml(html)).toBe("A short build note.");
  });

  test("long prose truncates at a sentence boundary when one falls in range", () => {
    const sentence = "This is the opening sentence of a much longer teardown that keeps going on";
    const html = `<p>${sentence}. And then it keeps rambling on for a very long time indeed, well past the excerpt target length so truncation must kick in somewhere.</p>`;
    const out = excerptFromHtml(html);
    expect(out.endsWith(".")).toBe(true);
    expect(out.length).toBeLessThan(html.length);
  });

  test("long prose with no good sentence break truncates at a word boundary with an ellipsis", () => {
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const out = excerptFromHtml(`<p>${words}</p>`);
    expect(out.endsWith("…")).toBe(true);
    expect(out.endsWith(" …")).toBe(false);
  });
});
