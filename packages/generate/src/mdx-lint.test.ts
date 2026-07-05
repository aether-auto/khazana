import { expect, test } from "vitest";
import { lintMdxJsxAttributes } from "./mdx-lint.js";

test("inner straight double-quotes in an attribute value are flagged", () => {
  const issues = lintMdxJsxAttributes('<Annotation note="a "b" c" />');
  expect(issues.length).toBeGreaterThan(0);
  expect(issues[0]!.message).toMatch(/curly quotes/);
});

test("backslash-escaped quotes in an attribute value are flagged", () => {
  const issues = lintMdxJsxAttributes('<Callout label="the \\"hot-potato\\" trade" />');
  expect(issues.length).toBeGreaterThan(0);
  expect(issues[0]!.message).toMatch(/curly quotes/);
});

test("typographic curly quotes inside an attribute value pass", () => {
  const issues = lintMdxJsxAttributes('<Annotation note="the “arid interruption” in the Sahara" />');
  expect(issues).toEqual([]);
});

test("single quotes / apostrophes inside a double-quoted value pass", () => {
  const issues = lintMdxJsxAttributes('<Annotation note="Sereno (2008): \'a harsh interval\' it\'s fine" />');
  expect(issues).toEqual([]);
});

test("expression attributes with quotes are not flagged", () => {
  const issues = lintMdxJsxAttributes(
    '<Timeline events={[{ date: "0005-01-01", label: "AHP \\"end\\"" }]} />',
  );
  expect(issues).toEqual([]);
});

test("math blocks with braces are not misread as JSX", () => {
  const issues = lintMdxJsxAttributes(
    '$$\n\\text{monsoon strength} \\propto \\frac{\\text{gradient}}{\\text{resistance}}\n$$\n',
  );
  expect(issues).toEqual([]);
});

test("prose double-quotes outside any tag pass", () => {
  const issues = lintMdxJsxAttributes('The best answer is "locally abrupt, globally gradual" here.\n');
  expect(issues).toEqual([]);
});

test("fenced code with quotes is not scanned", () => {
  const issues = lintMdxJsxAttributes('```js\nconst x = "<Annotation note=\\"a \\"b\\"\\" />";\n```\n');
  expect(issues).toEqual([]);
});

test("line numbers account for the frontmatter offset", () => {
  const mdx = `---\ntitle: "T"\nformat: dispatch\n---\n\nBody line.\n<Annotation note="a "b" c" />\n`;
  const issues = lintMdxJsxAttributes(mdx);
  expect(issues.length).toBeGreaterThan(0);
  // frontmatter (4 lines: --- title format ---) + blank + Body + the tag = line 7
  expect(issues[0]!.line).toBe(7);
});
