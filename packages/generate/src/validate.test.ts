import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { KNOWN_COMPONENTS, RETIRED_COMPONENTS, validateDraft } from "./validate.js";

// Parse the actual site mdx barrel and return every component it exports as a
// default/named component (i.e. `export { default as Foo }` and
// `export { default as Bar, Baz }`), ignoring `export type`.
function barrelComponents(): Set<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  const barrel = join(here, "..", "..", "..", "apps", "site", "src", "components", "mdx", "index.ts");
  const src = readFileSync(barrel, "utf8");
  const names = new Set<string>();
  for (const m of src.matchAll(/export\s*\{([^}]*)\}\s*from/g)) {
    if (/^\s*export\s*type/.test(m[0]!)) continue;
    for (const raw of m[1]!.split(",")) {
      const part = raw.trim();
      if (!part) continue;
      // `default as Foo` → Foo; `Bar` → Bar; skip `type X`.
      const asMatch = part.match(/\bas\s+([A-Za-z0-9_]+)/);
      const name = asMatch ? asMatch[1]! : part;
      if (/^[A-Z]/.test(name)) names.add(name);
    }
  }
  return names;
}

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

test("component allow-list matches the mdx barrel (minus retired), no drift", () => {
  const barrel = barrelComponents();
  // Every retired component is exported by the barrel but MUST be excluded.
  for (const r of RETIRED_COMPONENTS) expect(barrel.has(r)).toBe(true);
  const expected = [...barrel].filter((c) => !RETIRED_COMPONENTS.includes(c as never)).sort();
  expect([...KNOWN_COMPONENTS].sort()).toEqual(expected);
});

test("retired components are NOT authorable even though the barrel exports them", () => {
  for (const r of RETIRED_COMPONENTS) {
    expect(KNOWN_COMPONENTS as readonly string[]).not.toContain(r);
  }
});

test("a newly-mandated component (Pullquote/StatBand) now passes", () => {
  const body = 'import { Pullquote, StatBand } from "@/components/mdx";\n\n<Pullquote>x</Pullquote>\n<StatBand />';
  const r = validateDraft(mdx(VALID_FM, body), KNOWN_URLS);
  expect(r.ok).toBe(true);
  expect(r.errors).toEqual([]);
});

test("the retired NarrativeScene component is rejected", () => {
  const body = 'import { NarrativeScene } from "@/components/mdx";\n\n<NarrativeScene />';
  const r = validateDraft(mdx(VALID_FM, body), KNOWN_URLS);
  expect(r.ok).toBe(false);
  expect(r.errors.join(" ")).toContain("NarrativeScene");
});
