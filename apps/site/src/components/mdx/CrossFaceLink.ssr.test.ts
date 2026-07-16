import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

// SSR contract for CrossFaceLink.astro (faces-cross-face-moments plan). Like
// AtlasShell.ssr.test.ts / Shell.ssr.test.ts, the render happens in a SEPARATE
// Node process (test/render-crossfacelink.mjs) via Astro's own Vite pipeline —
// Vitest 2.1.9's bundled Vite can't load Astro 5.18's getViteConfig. That harness
// renders CrossFaceLink both directions and prints JSON we parse and assert on
// here.
const siteRoot = fileURLToPath(new URL("../../../", import.meta.url));
const harness = fileURLToPath(new URL("../../../test/render-crossfacelink.mjs", import.meta.url));

let rendered: { toAtlas: string; toStudy: string };

beforeAll(() => {
  const out = execFileSync("node", [harness], {
    cwd: siteRoot,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  rendered = JSON.parse(out);
}, 120_000);

describe("CrossFaceLink.astro — Study → Atlas direction", () => {
  it("is a plain functional <a href> — no client-side JS required", () => {
    expect(rendered.toAtlas).toMatch(/<a[^>]*\bhref="\/atlas\/reports\/india"/);
    // no client directive markup (no astro-island / hydration wrapper)
    expect(rendered.toAtlas).not.toContain("astro-island");
  });

  it("carries data-astro-reload (forces a full cross-document navigation)", () => {
    expect(rendered.toAtlas).toMatch(/<a[^>]*\bdata-astro-reload/);
  });

  it('carries data-face-cross-type="to-atlas-quiet"', () => {
    expect(rendered.toAtlas).toContain('data-face-cross-type="to-atlas-quiet"');
  });

  it("renders the ↗ glyph and the destination-accent (info) color role", () => {
    expect(rendered.toAtlas).toContain("&#8599;");
    expect(rendered.toAtlas).toContain("mdx-cross-face--info");
  });
});

describe("CrossFaceLink.astro — Atlas → Study direction", () => {
  it("is a plain functional <a href> — no client-side JS required", () => {
    expect(rendered.toStudy).toMatch(/<a[^>]*\bhref="\/reads\/some-post"/);
    expect(rendered.toStudy).not.toContain("astro-island");
  });

  it("carries data-astro-reload (forces a full cross-document navigation)", () => {
    expect(rendered.toStudy).toMatch(/<a[^>]*\bdata-astro-reload/);
  });

  it('carries data-face-cross-type="to-study-quiet"', () => {
    expect(rendered.toStudy).toContain('data-face-cross-type="to-study-quiet"');
  });

  it("renders the ↗ glyph and the destination-accent (accent/amber) color role", () => {
    expect(rendered.toStudy).toContain("&#8599;");
    expect(rendered.toStudy).toContain("mdx-cross-face--accent");
  });
});
