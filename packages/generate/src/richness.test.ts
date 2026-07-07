import { expect, test } from "vitest";
import { computeRichness, EGREGIOUS_DISTINCT_ISLAND_FLOOR, WORDS_PER_ISLAND_TARGET } from "./richness.js";

function mdx(format: string, body: string): string {
  return `---\ntitle: "T"\nformat: ${format}\nchannels:\n  - ai\nsummary: "s"\npublishedAt: 2026-06-23T00:00:00.000Z\nsources:\n  - { title: "S", url: "https://e.com/1" }\n---\n${body}\n`;
}

test("counts prose words, excluding JSX tags and import lines", () => {
  const body = `import { Chart } from "../../components/mdx";\n\nOne two three four five.\n\n<Chart client:visible data={[{a:1}]} />\n`;
  const r = computeRichness(mdx("dispatch", body));
  // "One two three four five." → 5 words. Import line + JSX attrs must not inflate the count.
  expect(r.words).toBe(5);
});

test("distinct island components exclude marginalia helpers (Annotation/Sidenote/Callout/Detail/Definition/Pullquote/StatBand)", () => {
  const body = `<Annotation term="x" note="y" /> <Sidenote>z</Sidenote> <Callout kind="note">a</Callout>
<Detail summary="s">b</Detail> <Definition term="t" def="d" /> <Pullquote>q</Pullquote> <StatBand stats={[]} />
<Chart mark="line" data={[]} />
`;
  const r = computeRichness(mdx("dispatch", body));
  expect(r.distinctIslandComponents).toEqual(["Chart"]);
});

test("a genuinely dense dispatch (many distinct islands, low words/island) meets target", () => {
  const words = Array.from({ length: 900 }, () => "word").join(" ");
  const body = `<Chart data={[]} />\n${words}\n<DataTable columns={[]} rows={[]} />\n<Diagram nodes={[]} edges={[]} />\n`;
  const r = computeRichness(mdx("dispatch", body));
  expect(r.distinctIslandComponents.sort()).toEqual(["Chart", "DataTable", "Diagram"]);
  expect(r.wordsPerIsland).not.toBeNull();
  expect(r.meetsTarget).toBe(true);
  expect(r.egregious).toBe(false);
});

test("a sparse long-form read (below target but not egregious) is reported, not hard-failed", () => {
  const words = Array.from({ length: 4000 }, () => "word").join(" ");
  const body = `<Chart data={[]} />\n${words}\n<DataTable columns={[]} rows={[]} />\n`;
  const r = computeRichness(mdx("dispatch", body));
  expect(r.distinctIslandComponents.length).toBe(2);
  expect(r.meetsTarget).toBe(false); // words/island (~2000) is above the ~800-1000 target band
  expect(r.egregious).toBe(false); // 2 distinct islands clears the conservative floor
});

test("an EGREGIOUS under-build (0 or 1 distinct island component in a long-form format) hard-fails", () => {
  const words = Array.from({ length: 5000 }, () => "word").join(" ");
  const zeroIslands = computeRichness(mdx("dispatch", `${words}\n<Annotation term="x" note="y" />\n`));
  expect(zeroIslands.distinctIslandComponents).toEqual([]);
  expect(zeroIslands.egregious).toBe(true);

  const oneIsland = computeRichness(mdx("dispatch", `${words}\n<Chart data={[]} />\n`));
  expect(oneIsland.distinctIslandComponents).toEqual(["Chart"]);
  expect(oneIsland.egregious).toBe(true);
});

test("EGREGIOUS_DISTINCT_ISLAND_FLOOR is the documented threshold", () => {
  expect(EGREGIOUS_DISTINCT_ISLAND_FLOOR).toBeGreaterThanOrEqual(1);
});

test("field-notes is EXEMPT: never egregious, always meetsTarget, regardless of components", () => {
  const r = computeRichness(mdx("field-notes", "Short briefing body with no components at all, just prose."));
  expect(r.exempt).toBe(true);
  expect(r.egregious).toBe(false);
  expect(r.meetsTarget).toBe(true);
});

test("an unparseable/missing format is treated as non-exempt (not silently excused)", () => {
  const r = computeRichness("No frontmatter here.\n<Chart data={[]} />\n");
  expect(r.exempt).toBe(false);
});

test("wordsPerIsland is null when there are zero island instances", () => {
  const r = computeRichness(mdx("dispatch", "Just prose, no components whatsoever here at all."));
  expect(r.wordsPerIsland).toBeNull();
});

test("reports the target band so the verify printout can show target vs actual", () => {
  const r = computeRichness(mdx("dispatch", "<Chart data={[]} />\nsome words here for the body text.\n"));
  expect(r.target).toBe(WORDS_PER_ISLAND_TARGET);
});

test("islandInstanceCount counts repeats; distinct count does not", () => {
  const body = "<Chart data={[]} /> <Chart data={[]} /> <Chart data={[]} />\nprose prose prose prose prose.\n";
  const r = computeRichness(mdx("dispatch", body));
  expect(r.distinctIslandComponents).toEqual(["Chart"]);
  expect(r.islandInstanceCount).toBe(3);
});
