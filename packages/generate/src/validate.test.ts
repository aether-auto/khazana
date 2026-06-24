import { expect, test } from "vitest";
import { KNOWN_COMPONENTS, validateDraft } from "./validate.js";

const KNOWN_URLS = new Set(["https://e.com/1", "https://e.com/2"]);

function mdx(frontmatter: string, body = "Body."): string {
  return `---\n${frontmatter}\n---\n${body}\n`;
}

const VALID_FM = [
  'title: "OpenAI ships GPT-5"',
  "format: dispatch",
  "channels:",
  "  - ai",
  'summary: "It ships."',
  "publishedAt: 2026-06-23T00:00:00.000Z",
  "sources:",
  '  - { title: "GPT-5 launch", url: "https://e.com/1" }',
].join("\n");

test("a fully valid, grounded draft passes", () => {
  const body = 'import { Chart, Annotation } from "@/components/mdx";\n\n<Chart /> <Annotation>x</Annotation>';
  const r = validateDraft(mdx(VALID_FM, body), KNOWN_URLS);
  expect(r.ok).toBe(true);
  expect(r.errors).toEqual([]);
  expect(r.slug).toBe("openai-ships-gpt-5");
});

test("missing/empty frontmatter fails", () => {
  const r = validateDraft("No frontmatter here.\n", KNOWN_URLS);
  expect(r.ok).toBe(false);
  expect(r.errors.join(" ")).toMatch(/frontmatter/i);
});

test("format not in FORMAT_NAMES fails", () => {
  const fm = VALID_FM.replace("format: dispatch", "format: explainer");
  const r = validateDraft(mdx(fm), KNOWN_URLS);
  expect(r.ok).toBe(false);
  expect(r.errors.join(" ")).toMatch(/format/i);
});

test("channel not in CHANNELS fails", () => {
  const fm = VALID_FM.replace("  - ai", "  - cooking");
  const r = validateDraft(mdx(fm), KNOWN_URLS);
  expect(r.ok).toBe(false);
  expect(r.errors.join(" ")).toMatch(/channel/i);
});

test("empty sources array fails (must cite at least one)", () => {
  const fm = [
    'title: "T"',
    "format: dispatch",
    "channels:",
    "  - ai",
    'summary: "s"',
    "publishedAt: 2026-06-23T00:00:00.000Z",
    "sources: []",
  ].join("\n");
  const r = validateDraft(mdx(fm), KNOWN_URLS);
  expect(r.ok).toBe(false);
  expect(r.errors.join(" ")).toMatch(/source/i);
});

test("a source url not traceable to a known FeedItem fails grounding", () => {
  const fm = VALID_FM.replace("https://e.com/1", "https://evil.example/made-up");
  const r = validateDraft(mdx(fm), KNOWN_URLS);
  expect(r.ok).toBe(false);
  expect(r.errors.join(" ")).toMatch(/ground|known source/i);
});

test("a hallucinated component name fails", () => {
  const body = 'import { HoloDeck } from "@/components/mdx";\n\n<HoloDeck />';
  const r = validateDraft(mdx(VALID_FM, body), KNOWN_URLS);
  expect(r.ok).toBe(false);
  expect(r.errors.join(" ")).toMatch(/component/i);
  expect(r.errors.join(" ")).toContain("HoloDeck");
});

test("KNOWN_COMPONENTS matches the P5B barrel exactly", () => {
  expect([...KNOWN_COMPONENTS].sort()).toEqual(
    ["Annotation", "Chart", "DataTable", "Map", "RunnableCode", "Scrolly", "ScrollyStep", "Timeline"].sort(),
  );
});
