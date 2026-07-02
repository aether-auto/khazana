// apps/site/src/components/mdx/p0-ssr.test.ts
//
// SSR / no-JS fallback tests for the P0 React islands (Math, Definition). The
// repo's vitest include glob only matches `*.test.ts` and runs in the Node
// environment, so we render the islands with react-dom/server's
// renderToStaticMarkup via React.createElement (no JSX, no jsdom) and assert the
// static HTML is meaningful and non-empty — the "never blank" invariant.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import Math from "./Math.js";
import Definition from "./Definition.js";

test("Math SSR renders the headline equation (KaTeX HTML), never blank", () => {
  const html = renderToStaticMarkup(createElement(Math, { tex: "e^{i\\pi} + 1 = 0" }));
  expect(html.length).toBeGreaterThan(0);
  // KaTeX server-renders to a .katex span even without JS.
  expect(html).toContain("katex");
  expect(html).toContain("mdx-math");
});

test("Math SSR renders every derivation step's tex + note in the DOM", () => {
  const html = renderToStaticMarkup(
    createElement(Math, {
      tex: "S = \\frac{n(n+1)}{2}",
      numbered: true,
      steps: [
        { tex: "S = 1 + 2 + \\cdots + n", note: "write the sum forwards" },
        { tex: "2S = n(n+1)", note: "add it to its reverse" },
      ],
    }),
  );
  // both step notes present in static markup (role=note, reachable no-JS)
  expect(html).toContain("write the sum forwards");
  expect(html).toContain("add it to its reverse");
  expect(html).toContain("mdx-math__step");
});

test("Definition SSR renders term + abbr[title] fallback + note, never blank", () => {
  const html = renderToStaticMarkup(
    createElement(Definition, {
      term: "entropy",
      def: "a measure of uncertainty in a distribution",
    }),
  );
  expect(html.length).toBeGreaterThan(0);
  expect(html).toContain("entropy");
  // no-JS teaching affordance: <abbr title="...">
  expect(html).toContain('title="a measure of uncertainty in a distribution"');
  // popover text also present in the static DOM (role=note)
  expect(html).toContain('role="note"');
  expect(html).toContain("mdx-def__term");
});
