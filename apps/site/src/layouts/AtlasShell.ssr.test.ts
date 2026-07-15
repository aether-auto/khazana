import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

// SSR contract for AtlasShell.astro. Like Shell.ssr.test.ts, the render happens
// in a SEPARATE Node process (test/render-shell-faces.mjs) via Astro's own Vite
// pipeline — Vitest 2.1.9's bundled Vite can't load Astro 5.18's getViteConfig.
// That harness renders AtlasShell with a representative surface active
// (`browser`) and the SiteGate enabled (a dummy PUBLIC_SITE_GATE_HASH), then
// prints JSON we parse and assert on here.
const siteRoot = fileURLToPath(new URL("../../", import.meta.url));
const harness = fileURLToPath(new URL("../../test/render-shell-faces.mjs", import.meta.url));

let rendered: {
  studyDefault: string;
  studyExplicit: string;
  atlas: string;
  atlasShell: string;
};

beforeAll(() => {
  const out = execFileSync("node", [harness], {
    cwd: siteRoot,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  rendered = JSON.parse(out);
}, 120_000);

describe("AtlasShell.astro SSR face stamp", () => {
  it('stamps data-face="atlas" on the opening <html> element', () => {
    expect(rendered.atlasShell).toMatch(/<html[^>]*\bdata-face="atlas"/);
    expect(rendered.atlasShell).not.toContain('data-face="study"');
  });
});

describe("AtlasShell.astro SiteGate hook", () => {
  it("renders the SAME access curtain as the Study when the gate hash is set", () => {
    // The harness sets a dummy PUBLIC_SITE_GATE_HASH, so both shells must emit
    // the gate overlay (`khz-gate`). This proves AtlasShell reuses SiteGate.
    expect(rendered.atlasShell).toContain("khz-gate");
    expect(rendered.studyDefault).toContain("khz-gate");
  });
});

describe("AtlasShell.astro instrument rail", () => {
  const railHrefs = [
    "/atlas",
    "/atlas/reports/india",
    "/atlas/browser",
    "/atlas/bias",
    "/atlas/theaters/red-sea",
    "/atlas/structure/india",
    "/atlas/sources",
  ];

  it("renders all seven §5.2 Atlas surface links", () => {
    for (const href of railHrefs) {
      expect(rendered.atlasShell).toContain(`href="${href}"`);
    }
    // exactly seven rail links (one per surface).
    const railLinks = rendered.atlasShell.match(/class="rail-link[^"]*"/g) ?? [];
    expect(railLinks).toHaveLength(7);
  });

  it("lights the current surface (active=browser) and only that one", () => {
    // The browser rail link carries is-current + aria-current="page".
    expect(rendered.atlasShell).toMatch(
      /<a\b[^>]*class="rail-link is-current"[^>]*data-surface="browser"|<a\b[^>]*data-surface="browser"[^>]*class="rail-link is-current"/,
    );
    // exactly one lit rail link.
    const lit = rendered.atlasShell.match(/class="rail-link is-current"/g) ?? [];
    expect(lit).toHaveLength(1);
  });
});

describe("AtlasShell.astro mono breadcrumb", () => {
  it("renders the crumb trail in the instrument voice (atlas / browser)", () => {
    expect(rendered.atlasShell).toMatch(/class="breadcrumb"/);
    expect(rendered.atlasShell).toMatch(/crumb-root"[^>]*>atlas</);
    expect(rendered.atlasShell).toMatch(/class="crumb"[^>]*>browser</);
  });
});

describe("AtlasShell.astro bezel face-switch (plain link)", () => {
  it("renders a real anchor crossing back to the Study root", () => {
    expect(rendered.atlasShell).toContain('class="face-switch"');
    expect(rendered.atlasShell).toContain('aria-label="Switch to the Study"');
    expect(rendered.atlasShell).toMatch(/<a\b[^>]*class="face-switch"[^>]*href="\/"/);
  });

  it("carries data-astro-reload so the crossing is a full-document navigation", () => {
    expect(rendered.atlasShell).toMatch(
      /<a\b[^>]*class="face-switch"[^>]*data-astro-reload|<a\b[^>]*data-astro-reload[^>]*class="face-switch"/,
    );
  });
});

// AtlasShell must wire the SAME transition as the Study shell so a crossing in
// EITHER direction is choreographed: the @view-transition opt-in inline in the
// render-blocking head, and face-switch.ts as a hoisted module script. Behavior
// is browser-verified per spec §8; here we assert both are present in the head.
describe("AtlasShell.astro face-switch transition wiring (SSR head)", () => {
  const head = (html: string) => html.slice(0, html.indexOf("</head>"));

  it("stamps the @view-transition { navigation: auto } opt-in inline in the head", () => {
    expect(head(rendered.atlasShell)).toMatch(/@view-transition\s*\{\s*navigation:\s*auto;?\s*\}/);
  });

  it("imports face-switch.ts as a hoisted module script in the head", () => {
    // The compiled form of `<script>import "../lib/face-switch.ts"` — the only
    // processed <script> in the Atlas shell's head.
    expect(head(rendered.atlasShell)).toMatch(
      /<script type="module" src="[^"]*layouts\/AtlasShell\.astro\?astro&type=script/,
    );
  });
});
