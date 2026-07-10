import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { expect, test } from "vitest";
import { BlogFrontmatterSchema, KNOWN_COMPONENTS, RETIRED_COMPONENTS, validateDraft } from "./validate.js";
import { CONTRACT_COMPONENTS } from "./component-contract.js";

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
  // Retired components are fully removed from the barrel (not merely blocked
  // from the allow-list) once confirmed at 0 live uses — see RETIRED_COMPONENTS
  // in validate.ts. Filtering them out of `barrel` here is a no-op today but
  // keeps this test correct if a future retirement is kept in the barrel for
  // backwards-compat instead.
  for (const r of RETIRED_COMPONENTS) expect(barrel.has(r)).toBe(false);
  const expected = [...barrel].filter((c) => !RETIRED_COMPONENTS.includes(c as never)).sort();
  expect([...KNOWN_COMPONENTS].sort()).toEqual(expected);
});

test("mdx-contract documented set equals KNOWN_COMPONENTS (no contract drift)", () => {
  // Binds the canonical contract list (mirrored in every writer mdx-contract.md
  // allow-list block) to the enforced allow-list. Kills the historical
  // "writers told 10, 16 legal" drift permanently.
  expect([...CONTRACT_COMPONENTS].sort()).toEqual([...KNOWN_COMPONENTS].sort());
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

test("a draft with inner straight quotes in a JSX attribute fails (mdx-syntax)", () => {
  const body =
    'import { Annotation } from "@/components/mdx";\n\n<Annotation note="the "arid interruption" in the Sahara" />';
  const r = validateDraft(mdx(VALID_FM, body), KNOWN_URLS);
  expect(r.ok).toBe(false);
  expect(r.errors.join(" ")).toMatch(/mdx-syntax/);
});

test("the same draft with curly quotes in the JSX attribute passes", () => {
  const body =
    'import { Annotation } from "@/components/mdx";\n\n<Annotation note="the “arid interruption” in the Sahara" />';
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

test("a DataTable cell that contradicts a prose restatement of the same quantity fails (numeric-consistency)", () => {
  const body = `<DataTable
  caption="Casualty figures by theater."
  columns={[
    { key: "country", label: "Country", type: "string" },
    { key: "casualties", label: "Casualties", type: "number" }
  ]}
  rows={[
    { country: "France", casualties: "3,255" }
  ]}
/>

Historians estimate France suffered 3,231 casualties in the campaign, a staggering toll.
`;
  const r = validateDraft(mdx(VALID_FM, body), KNOWN_URLS);
  expect(r.ok).toBe(false);
  expect(r.errors.join(" ")).toMatch(/numeric-consistency/);
});

// ── source tier/origin schema back-compat (COMP-2: on-page corroboration rail) ──
// `sources[].tier` / `sources[].origin` are NEW, OPTIONAL fields. Every Read
// shipped before they existed has plain `{ title, url }` sources — this proves
// the schema change never breaks a single one of them.
function blogDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "..", "apps", "site", "src", "content", "blog");
}

test("every committed Read's frontmatter still parses against BlogFrontmatterSchema (back-compat)", () => {
  const dir = blogDir();
  const files = readdirSync(dir).filter((f) => f.endsWith(".mdx"));
  expect(files.length).toBeGreaterThan(0); // guard against a silently-empty fixture dir
  for (const file of files) {
    const raw = readFileSync(join(dir, file), "utf8");
    const { data } = matter(raw);
    const result = BlogFrontmatterSchema.safeParse(data);
    expect(result.success, `${file}: ${result.success ? "" : JSON.stringify(result.error.issues)}`).toBe(true);
    // Back-compat guarantee = every committed Read still PARSES (asserted above).
    // We intentionally do NOT assert that sources lack tier/origin: those optional
    // fields are now legitimately present on newly-authored Reads (the corroboration
    // rail emits them — see the forward-compat test below), so an absence check here
    // would be invalid the moment a Read carrying them lands.
  }
});

test("a source WITH tier + origin parses (forward-compat with newly-authored Reads)", () => {
  const result = BlogFrontmatterSchema.safeParse({
    title: "T",
    format: "dispatch",
    channels: ["ai"],
    summary: "s",
    publishedAt: "2026-06-23T00:00:00.000Z",
    sources: [{ title: "A primary source", url: "https://e.com/1", tier: "high", origin: "researched" }],
    draft: false,
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.sources[0]).toMatchObject({ tier: "high", origin: "researched" });
  }
});

test("an invalid tier/origin value fails validation (still a closed enum)", () => {
  const result = BlogFrontmatterSchema.safeParse({
    title: "T",
    format: "dispatch",
    channels: ["ai"],
    summary: "s",
    publishedAt: "2026-06-23T00:00:00.000Z",
    sources: [{ title: "A", url: "https://e.com/1", tier: "gold", origin: "curated" }],
    draft: false,
  });
  expect(result.success).toBe(false);
});

test("a draft with internally-consistent numbers passes the numeric-consistency check", () => {
  const body = `<StatBand
  caption="Peak throughput"
  stats={[
    { value: 989, decimals: 0, suffix: " TFLOPS", label: "H100 peak BF16 (dense)" }
  ]}
/>

The H100 peak BF16 (dense) throughput is 989 TFLOPS, astonishing for its era.
`;
  const r = validateDraft(mdx(VALID_FM, body), KNOWN_URLS);
  expect(r.ok).toBe(true);
  expect(r.errors).toEqual([]);
});
