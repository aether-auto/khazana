// apps/site/src/components/lib/gl-gates-consumers.test.ts
//
// Source-scan regression guard for the gl-gates extraction. Keeps every
// live-WebGL island (Model3D, FirstLight, and the future Atlas Globe) importing
// the shared low-power / WebGL gates from components/lib/gl-gates.ts instead of
// pasting a private copy back into the component — the exact regression the
// extraction exists to prevent. Same readFileSync source-scan style as
// mdx/model3d-glb.test.ts; no component is executed here.
//
// NOTE on prefersReducedMotion(): it is NOT globally unique in apps/site/src —
// ~12 self-contained mdx components (Timeline, Scrolly, BattleMap, ...) and
// scripts/scroll-to.ts each keep their own private DOM-motion helper of the
// same name. Those are unrelated to the WebGL gates and out of this task's
// scope, so we do NOT assert global uniqueness for prefersReducedMotion. We
// assert (a) isLowPower/hasWebGL — which ARE genuinely GL-only gates — are
// defined nowhere but gl-gates.ts, and (b) the two GL islands neither redefine
// the pair locally nor import it from anywhere but the shared module.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const SITE_SRC = fileURLToPath(new URL("../../", import.meta.url)); // apps/site/src
const GL_GATES_REL = "components/lib/gl-gates.ts";

function walkSource(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!ent.isFile()) continue;
    if (!/\.tsx?$/.test(ent.name)) continue;
    if (/\.test\.tsx?$/.test(ent.name)) continue; // skip test files' own string literals
    out.push(`${ent.parentPath ?? dir}/${ent.name}`);
  }
  return out;
}

function relFromSiteSrc(abs: string): string {
  return abs.slice(SITE_SRC.length).replace(/^\/+/, "");
}

/** Files under apps/site/src that define `function <name>` (module-scope decl). */
function filesDefining(name: string): string[] {
  const re = new RegExp(`function\\s+${name}\\s*\\(`);
  return walkSource(SITE_SRC)
    .filter((f) => re.test(readFileSync(f, "utf8")))
    .map(relFromSiteSrc)
    .sort();
}

/** Parse the `import { ... } from "<x>gl-gates"` statement of a source file. */
function glGatesImport(
  src: string,
): { names: string[]; specifier: string } | null {
  const m = src.match(
    /import\s*\{([^}]*)\}\s*from\s*["']([^"']*gl-gates)["']/,
  );
  if (!m) return null;
  return {
    names: (m[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    specifier: m[2] ?? "",
  };
}

describe("gl-gates extraction — source-scan regression guard", () => {
  test("isLowPower() is defined only in components/lib/gl-gates.ts", () => {
    expect(filesDefining("isLowPower")).toEqual([GL_GATES_REL]);
  });

  test("hasWebGL() is defined only in components/lib/gl-gates.ts", () => {
    expect(filesDefining("hasWebGL")).toEqual([GL_GATES_REL]);
  });

  describe("Model3D.tsx", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../mdx/Model3D.tsx", import.meta.url)),
      "utf8",
    );

    test("does not redefine the GL gates locally", () => {
      expect(src).not.toMatch(/function\s+isLowPower\s*\(/);
      expect(src).not.toMatch(/function\s+prefersReducedMotion\s*\(/);
    });

    test("imports isLowPower + prefersReducedMotion from the shared module", () => {
      const imp = glGatesImport(src);
      expect(imp).not.toBeNull();
      expect(imp?.specifier).toBe("../lib/gl-gates");
      expect(imp?.names).toEqual(
        expect.arrayContaining(["isLowPower", "prefersReducedMotion"]),
      );
    });
  });

  describe("FirstLight.tsx", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../FirstLight.tsx", import.meta.url)),
      "utf8",
    );

    test("does not redefine the GL gates locally", () => {
      expect(src).not.toMatch(/function\s+isLowPower\s*\(/);
      expect(src).not.toMatch(/function\s+prefersReducedMotion\s*\(/);
      expect(src).not.toMatch(/function\s+hasWebGL\s*\(/);
    });

    test("imports isLowPower + prefersReducedMotion + hasWebGL from the shared module", () => {
      const imp = glGatesImport(src);
      expect(imp).not.toBeNull();
      expect(imp?.specifier).toBe("./lib/gl-gates");
      expect(imp?.names).toEqual(
        expect.arrayContaining([
          "isLowPower",
          "prefersReducedMotion",
          "hasWebGL",
        ]),
      );
    });
  });
});
