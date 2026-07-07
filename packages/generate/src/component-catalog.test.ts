import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { CONTRACT_COMPONENTS } from "./component-contract.js";
import { buildComponentCatalog } from "./component-catalog.js";

let contentDir: string;
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "khz-catalog-"));
  contentDir = join(root, "blog");
  mkdirSync(contentDir, { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

test("emits exactly one entry per CONTRACT_COMPONENTS name", () => {
  const catalog = buildComponentCatalog(contentDir, "2026-07-07T00:00:00.000Z");
  expect(catalog.components).toHaveLength(CONTRACT_COMPONENTS.length);
  expect(catalog.components.map((c) => c.name).sort()).toEqual([...CONTRACT_COMPONENTS].sort());
  expect(catalog.generatedAt).toBe("2026-07-07T00:00:00.000Z");
});

test("every entry carries blurb, props, kits, and a usage count", () => {
  const catalog = buildComponentCatalog(contentDir, "2026-07-07T00:00:00.000Z");
  for (const c of catalog.components) {
    expect(c.blurb.length).toBeGreaterThan(0);
    expect(c.props.length).toBeGreaterThan(0);
    expect(c.kits.length).toBeGreaterThan(0);
    expect(c.usageCount).toBe(0); // empty contentDir — nothing used yet
  }
});

test("usageCount reflects real live usage across content/blog/*.mdx (a known workhorse scores > 0)", () => {
  writeFileSync(
    join(contentDir, "a.mdx"),
    `---\ntitle: "A"\n---\n<Annotation term="x" note="y" /> <Chart data={[]} />\n`,
  );
  writeFileSync(join(contentDir, "b.mdx"), `---\ntitle: "B"\n---\n<Annotation term="z" note="w" />\n`);
  const catalog = buildComponentCatalog(contentDir, "2026-07-07T00:00:00.000Z");
  const byName = new Map(catalog.components.map((c) => [c.name, c]));
  expect(byName.get("Annotation")!.usageCount).toBe(2); // used in both files
  expect(byName.get("Chart")!.usageCount).toBe(1); // used in one file
  expect(byName.get("Model3D")!.usageCount).toBe(0); // an orphan — never used
});

test("counts a component once per FILE, not per raw tag instance (matches the audit's 'used in N reads' framing)", () => {
  writeFileSync(
    join(contentDir, "repeated.mdx"),
    `---\ntitle: "R"\n---\n<Chart data={[]} /> <Chart data={[]} /> <Chart data={[]} />\n`,
  );
  const catalog = buildComponentCatalog(contentDir, "2026-07-07T00:00:00.000Z");
  const chart = catalog.components.find((c) => c.name === "Chart")!;
  expect(chart.usageCount).toBe(1);
});

test("handles a missing content directory gracefully (usageCount 0 everywhere)", () => {
  const catalog = buildComponentCatalog(join(root, "does-not-exist"), "2026-07-07T00:00:00.000Z");
  expect(catalog.components.every((c) => c.usageCount === 0)).toBe(true);
});
