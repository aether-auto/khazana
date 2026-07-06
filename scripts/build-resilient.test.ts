import { describe, expect, test } from "vitest";
import { extractReason, parseFailedSlug } from "./build-resilient.mts";

// Real-shape astro/vite failure strings. The runtime `_createMdxContent` error
// (the class that froze the pipeline) names the compiled chunk + the route; a
// parse error names the source .mdx. The parser must recover the slug from all.

const RUNTIME_ERROR = `
20:49:39 ▶ src/pages/reads/[slug].astro
20:49:39   ├─ /reads/how-a-bloom-filter-says-probably/index.html (+86ms)
20:49:39   └─ /reads/sparse-moe-expert-routing/index.htmli is not defined
  Hint:
    This issue often occurs when your MDX component encounters runtime errors.
  Stack trace:
    at _createMdxContent (file:///repo/apps/site/dist/chunks/sparse-moe-expert-routing_DNZoQPHP.mjs:1363:14)
    at Object.Content [as type] (file:///repo/apps/site/dist/chunks/astro/server.mjs:8147:33)
`;

const SYNTAX_ERROR = `
[ERROR] Could not parse expression with acorn
    at file:///repo/apps/site/src/content/blog/the-green-sahara.mdx:42:7
  Hint: Unexpected character
`;

const ROUTE_ONLY_ERROR = `
error   TypeError: Cannot read properties of undefined (reading 'map')
  while rendering /reads/midway-carrier-battle/index.html
`;

const COMPONENT_BUG = `
[ERROR] Named export 'foo' not found.
    at file:///repo/apps/site/src/components/mdx/Chart.tsx:12:3
`;

describe("parseFailedSlug", () => {
  test("extracts slug from a runtime _createMdxContent chunk error", () => {
    expect(parseFailedSlug(RUNTIME_ERROR)).toBe("sparse-moe-expert-routing");
  });

  test("extracts slug from a parse error naming the source .mdx", () => {
    expect(parseFailedSlug(SYNTAX_ERROR)).toBe("the-green-sahara");
  });

  test("extracts slug from a /reads/<slug>/ route line", () => {
    expect(parseFailedSlug(ROUTE_ONLY_ERROR)).toBe("midway-carrier-battle");
  });

  test("prefers the chunk slug and validates against known Reads", () => {
    const known = ["sparse-moe-expert-routing", "how-a-bloom-filter-says-probably"];
    expect(parseFailedSlug(RUNTIME_ERROR, known)).toBe("sparse-moe-expert-routing");
  });

  test("returns null when the matched slug is not a known Read (not attributable)", () => {
    // Route names a slug, but it isn't in the on-disk Read set → abort territory.
    expect(parseFailedSlug(ROUTE_ONLY_ERROR, ["some-other-read"])).toBeNull();
  });

  test("returns null for a component/code bug that names no Read", () => {
    expect(parseFailedSlug(COMPONENT_BUG)).toBeNull();
    expect(parseFailedSlug(COMPONENT_BUG, ["sparse-moe-expert-routing"])).toBeNull();
  });

  test("returns null when there is nothing to match", () => {
    expect(parseFailedSlug("some unrelated log output")).toBeNull();
  });
});

describe("extractReason", () => {
  test("surfaces the runtime error message", () => {
    expect(extractReason(RUNTIME_ERROR)).toMatch(/is not defined/);
  });

  test("surfaces a parse error message", () => {
    expect(extractReason(SYNTAX_ERROR)).toMatch(/Could not parse|Unexpected/);
  });
});
