import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

// SSR contract for the two-face atmosphere layer: Shell.astro stamps
// `data-face` onto `<html>` at render time (zero runtime JS, no FOUC). Study is
// the default; Atlas layouts thread `face="atlas"` through.
//
// The render itself happens in a SEPARATE Node process (test/render-shell-
// faces.mjs) using Astro's own Vite pipeline — Vitest 2.1.9's bundled Vite
// can't load Astro 5.18's `getViteConfig` plugin set. That harness prints
// JSON { studyDefault, studyExplicit, atlas }; here we parse it and assert.
const siteRoot = fileURLToPath(new URL("../../", import.meta.url));
const harness = fileURLToPath(new URL("../../test/render-shell-faces.mjs", import.meta.url));

let rendered: { studyDefault: string; studyExplicit: string; atlas: string };

beforeAll(() => {
  const out = execFileSync("node", [harness], {
    cwd: siteRoot,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  rendered = JSON.parse(out);
}, 120_000);

describe("Shell.astro SSR data-face stamp", () => {
  it("defaults to the Study face when no face prop is passed", () => {
    expect(rendered.studyDefault).toContain('data-face="study"');
    expect(rendered.studyDefault).not.toContain('data-face="atlas"');
  });

  it('stamps data-face="study" when face="study" is passed', () => {
    expect(rendered.studyExplicit).toContain('data-face="study"');
  });

  it('stamps data-face="atlas" when face="atlas" is passed', () => {
    expect(rendered.atlas).toContain('data-face="atlas"');
    expect(rendered.atlas).not.toContain('data-face="study"');
  });

  it("stamps the face on the opening <html> element, not elsewhere", () => {
    // The attribute must live on <html> so the CSS delta cascades from the root.
    expect(rendered.atlas).toMatch(/<html[^>]*\bdata-face="atlas"/);
    expect(rendered.studyDefault).toMatch(/<html[^>]*\bdata-face="study"/);
  });
});
