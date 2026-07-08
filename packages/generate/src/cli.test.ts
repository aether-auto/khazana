import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { main } from "./cli.js";

let root: string;
let dataDir: string;
let contentDir: string;
const NOW = "2026-06-21T12:00:00.000Z"; // a Sunday → chronicle column is due

function curatedItem(id: string, clusterId: string, channel: string, taste: number): unknown {
  return {
    id, source: "src", sourceType: "rss", url: `https://e.com/${id}`, title: `Item ${id}`,
    publishedAt: "2026-06-21T00:00:00.000Z", fetchedAt: "2026-06-21T00:00:00.000Z",
    topics: [channel], entities: [], summary: `summary ${id}`, media: [],
    clusterId, tasteScore: taste, kind: "link",
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "khz-gen-cli-"));
  dataDir = join(root, "data");
  contentDir = join(root, "apps", "site", "src", "content", "blog");
  mkdirSync(join(dataDir, "feed"), { recursive: true });
  mkdirSync(contentDir, { recursive: true });
  writeFileSync(
    join(dataDir, "feed", "curated.json"),
    JSON.stringify([
      curatedItem("a1", "A", "ai", 9),
      curatedItem("a2", "A", "ai", 8),
      curatedItem("h1", "H", "history", 4),
    ]),
  );
  writeFileSync(join(root, "STYLE.md"), "## Voice\nConfident, curious, precise.");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

test("plan writes one brief per assignment", async () => {
  const code = await main(["plan"], { dataDir, repoRoot: root, contentDir, now: NOW });
  expect(code).toBe(0);
  const briefs = readdirSync(join(dataDir, "generation", "briefs")).filter((f) => f.endsWith(".md"));
  expect(briefs.length).toBeGreaterThan(0);
  // a brief mentions a real source url + a citation mandate
  const text = readFileSync(join(dataDir, "generation", "briefs", briefs[0]!), "utf8");
  expect(text).toContain("https://e.com/");
  expect(text.toLowerCase()).toContain("cite");
});

test("verify exits 0 on a grounded draft and writes report.json", async () => {
  writeFileSync(
    join(contentDir, "good.mdx"),
    `---
title: "Good"
format: field-notes
channels:
  - ai
summary: "s"
publishedAt: 2026-06-21T00:00:00.000Z
sources:
  - { title: "A1", url: "https://e.com/a1" }
---
<Annotation>note</Annotation>
`,
  );
  const code = await main(["verify"], { dataDir, repoRoot: root, contentDir, now: NOW });
  expect(code).toBe(0);
  const report = JSON.parse(readFileSync(join(dataDir, "generation", "report.json"), "utf8"));
  expect(report.ok).toBe(true);
  expect(report.drafts).toHaveLength(1);
});

test("verify exits 1 on an ungrounded draft", async () => {
  writeFileSync(
    join(contentDir, "bad.mdx"),
    `---
title: "Bad"
format: field-notes
channels:
  - ai
summary: "s"
publishedAt: 2026-06-21T00:00:00.000Z
sources:
  - { title: "Fake", url: "https://nope.example/x" }
---
Body.
`,
  );
  const code = await main(["verify"], { dataDir, repoRoot: root, contentDir, now: NOW });
  expect(code).toBe(1);
  const report = JSON.parse(readFileSync(join(dataDir, "generation", "report.json"), "utf8"));
  expect(report.ok).toBe(false);
});

// --- slug-scoped verify ---

function draft(title: string, url: string): string {
  return `---
title: "${title}"
format: field-notes
channels:
  - ai
summary: "s"
publishedAt: 2026-06-21T00:00:00.000Z
sources:
  - { title: "src", url: "${url}" }
---
<Annotation>note</Annotation>
`;
}

test("verify <slug> only checks that slug's draft", async () => {
  // slug-a is grounded by curated; slug-b cites an unknown url and would FAIL if checked.
  writeFileSync(join(contentDir, "slug-a.mdx"), draft("Slug A", "https://e.com/a1"));
  writeFileSync(join(contentDir, "slug-b.mdx"), draft("Slug B", "https://nope.example/x"));

  const code = await main(["verify", "slug-a"], { dataDir, repoRoot: root, contentDir, now: NOW });
  expect(code).toBe(0);
  const report = JSON.parse(readFileSync(join(dataDir, "generation", "report.json"), "utf8"));
  expect(report.ok).toBe(true);
  expect(report.drafts).toHaveLength(1);
  expect(report.drafts[0].file).toContain("slug-a.mdx");
});

test("verify errors when a requested slug has no matching draft", async () => {
  writeFileSync(join(contentDir, "slug-a.mdx"), draft("Slug A", "https://e.com/a1"));
  const code = await main(["verify", "missing-slug"], { dataDir, repoRoot: root, contentDir, now: NOW });
  expect(code).not.toBe(0);
});

test("verify with no slugs checks all drafts (unchanged behavior)", async () => {
  writeFileSync(join(contentDir, "slug-a.mdx"), draft("Slug A", "https://e.com/a1"));
  writeFileSync(join(contentDir, "slug-b.mdx"), draft("Slug B", "https://nope.example/x"));
  const code = await main(["verify"], { dataDir, repoRoot: root, contentDir, now: NOW });
  expect(code).toBe(1); // slug-b is ungrounded and IS checked
  const report = JSON.parse(readFileSync(join(dataDir, "generation", "report.json"), "utf8"));
  expect(report.drafts).toHaveLength(2);
});

test("verify's report.json carries a richness score for every draft", async () => {
  writeFileSync(
    join(contentDir, "dispatch-thin.mdx"),
    `---
title: "Dispatch"
format: dispatch
channels:
  - ai
summary: "s"
publishedAt: 2026-06-21T00:00:00.000Z
sources:
  - { title: "A1", url: "https://e.com/a1" }
---
<Chart data={[]} /> <DataTable columns={[]} rows={[]} />
Some real prose body for this dispatch draft, several words long.
`,
  );
  const code = await main(["verify"], { dataDir, repoRoot: root, contentDir, now: NOW });
  expect(code).toBe(0);
  const report = JSON.parse(readFileSync(join(dataDir, "generation", "report.json"), "utf8"));
  const d = report.drafts[0];
  expect(d.richness).toBeDefined();
  expect(d.richness.format).toBe("dispatch");
  expect(d.richness.distinctIslandComponents.sort()).toEqual(["Chart", "DataTable"]);
});

test("catalog writes a component catalog snapshot under .claude/skills/writers/", async () => {
  writeFileSync(
    join(contentDir, "some-read.mdx"),
    `---\ntitle: "X"\n---\n<Annotation term="a" note="b" /> <Chart data={[]} />\n`,
  );
  const code = await main(["catalog"], { dataDir, repoRoot: root, contentDir, now: NOW });
  expect(code).toBe(0);
  const catalog = JSON.parse(
    readFileSync(join(root, ".claude", "skills", "writers", "component-catalog.json"), "utf8"),
  );
  expect(catalog.generatedAt).toBe(NOW);
  const chart = catalog.components.find((c: { name: string }) => c.name === "Chart");
  expect(chart.usageCount).toBe(1);
  const orphan = catalog.components.find((c: { name: string }) => c.name === "Model3D");
  expect(orphan.usageCount).toBe(0);
});

test("unknown subcommand returns a non-zero code", async () => {
  const code = await main(["frobnicate"], { dataDir, repoRoot: root, contentDir, now: NOW });
  expect(code).toBe(2);
});
