import { describe, it, expect } from "vitest";
import {
  narratableParagraphs,
  pacingPlan,
  frontmatterChannels,
  PAUSE_BETWEEN_PARAGRAPHS_MS,
  PAUSE_AFTER_HEADING_MS,
} from "./chunk.js";

describe("narratableParagraphs", () => {
  it("returns [] for empty / whitespace / garbage", () => {
    expect(narratableParagraphs("")).toEqual([]);
    expect(narratableParagraphs("   \n\n  \t ")).toEqual([]);
    // pure component / code with no prose collapses to nothing
    expect(narratableParagraphs("```\nconst x = 1;\n```")).toEqual([]);
    expect(narratableParagraphs("<KellyChart client:load p={0.6} />")).toEqual([]);
  });

  it("strips YAML frontmatter and keeps only body prose", () => {
    const raw = [
      "---",
      'title: "The Arithmetic of Ruin"',
      "format: dispatch",
      "publishedAt: 2026-06-24T09:00:00.000Z",
      "---",
      "",
      "The first real paragraph of prose.",
    ].join("\n");
    const out = narratableParagraphs(raw);
    expect(out).toHaveLength(1);
    expect(out[0]!.text).toBe("The first real paragraph of prose.");
    expect(out.some((p) => p.text.includes("title"))).toBe(false);
  });

  it("drops import/export lines", () => {
    const raw = [
      'import { KellyChart, Chart } from "../../components/mdx";',
      "",
      "Real prose here.",
      "",
      "export const x = 1;",
    ].join("\n");
    const out = narratableParagraphs(raw);
    expect(out.map((p) => p.text)).toEqual(["Real prose here."]);
  });

  it("flags markdown headings and narrates the heading text", () => {
    const raw = [
      "# Top Heading",
      "",
      "Body under the top heading.",
      "",
      "## The bet that feels right",
      "",
      "More body text.",
    ].join("\n");
    const out = narratableParagraphs(raw);
    expect(out).toHaveLength(4);
    expect(out[0]).toMatchObject({ text: "Top Heading", isHeading: true });
    expect(out[1]).toMatchObject({ text: "Body under the top heading.", isHeading: false });
    expect(out[2]).toMatchObject({ text: "The bet that feels right", isHeading: true });
    expect(out[3]).toMatchObject({ text: "More body text.", isHeading: false });
  });

  it("preserves document order and assigns sequential indices", () => {
    const raw = ["First.", "", "Second.", "", "Third."].join("\n");
    const out = narratableParagraphs(raw);
    expect(out.map((p) => p.text)).toEqual(["First.", "Second.", "Third."]);
    expect(out.map((p) => p.index)).toEqual([0, 1, 2]);
  });

  it("strips fenced code blocks but keeps surrounding prose", () => {
    const raw = [
      "Before the code.",
      "",
      "```ts",
      "const f = (x: number) => x * 2;",
      "still code",
      "```",
      "",
      "After the code.",
    ].join("\n");
    const out = narratableParagraphs(raw);
    expect(out.map((p) => p.text)).toEqual(["Before the code.", "After the code."]);
  });

  it("strips inline `code` spans, keeping the words around them", () => {
    const raw = "The chance you survive `n` flips is `0.6` raised to the power.";
    const out = narratableParagraphs(raw);
    expect(out).toHaveLength(1);
    expect(out[0]!.text).toBe("The chance you survive flips is raised to the power.");
    expect(out[0]!.text).not.toContain("`");
  });

  it("strips inline $…$ and block $$…$$ math (does not speak LaTeX)", () => {
    const raw = "The peak is marked $f^*$ where the growth rate is highest.";
    const out = narratableParagraphs(raw);
    expect(out).toHaveLength(1);
    expect(out[0]!.text).toBe("The peak is marked where the growth rate is highest.");
    expect(out[0]!.text).not.toContain("$");

    const block = ["Then:", "", "$$ g(f) = p\\ln(1+bf) $$", "", "and so on."].join("\n");
    const outBlock = narratableParagraphs(block);
    expect(outBlock.map((p) => p.text)).toEqual(["Then:", "and so on."]);
  });

  it("keeps markdown link text and drops the URL syntax", () => {
    const raw = "See the [original Thorp paper](https://gwern.net/thorp.pdf) for details.";
    const out = narratableParagraphs(raw);
    expect(out).toHaveLength(1);
    expect(out[0]!.text).toBe("See the original Thorp paper for details.");
    expect(out[0]!.text).not.toContain("http");
    expect(out[0]!.text).not.toContain("](");
  });

  it("drops component-only lines but keeps prose paragraphs that contain inline JSX", () => {
    // A paragraph whose ONLY content is a self-closing component → dropped.
    // A paragraph that is real prose with an inline <Annotation .../> → kept as prose.
    const raw = [
      "<KellyChart",
      "  client:load",
      "  p={0.6}",
      "/>",
      "",
      "His insight came from <Annotation client:load term=\"information theory\" note=\"Kelly reframed Shannon.\" />, in a paper retitled for clarity.",
    ].join("\n");
    const out = narratableParagraphs(raw);
    expect(out).toHaveLength(1);
    expect(out[0]!.text).toBe(
      "His insight came from information theory, in a paper retitled for clarity.",
    );
    expect(out[0]!.text).not.toContain("<");
    expect(out[0]!.text).not.toContain("client:load");
  });

  it("keeps the human-readable term from an <Annotation term=… note=…/> when it is the prose anchor", () => {
    const raw =
      "The optimal fraction is <Annotation client:load math term=\"f^* = p - q\" note=\"For an even-money bet.\" /> — your edge.";
    const out = narratableParagraphs(raw);
    expect(out).toHaveLength(1);
    // math term in an annotation is LaTeX-ish — must not leak the note prose nor the attribute names
    expect(out[0]!.text).not.toContain("note=");
    expect(out[0]!.text).not.toContain("term=");
    expect(out[0]!.text).toContain("your edge");
  });

  it("unescapes common markdown escapes like \\$100", () => {
    const raw = "One of them turns \\$100 into a small fortune.";
    const out = narratableParagraphs(raw);
    expect(out[0]!.text).toBe("One of them turns $100 into a small fortune.");
  });

  it("collapses internal whitespace within a paragraph", () => {
    const raw = "Wealth   compounds\n   multiplicatively, so   the rate matters.";
    const out = narratableParagraphs(raw);
    expect(out).toHaveLength(1);
    expect(out[0]!.text).toBe("Wealth compounds multiplicatively, so the rate matters.");
  });

  it("is deterministic — same input yields identical output", () => {
    const raw = ["# H", "", "Para one.", "", "Para two."].join("\n");
    expect(narratableParagraphs(raw)).toEqual(narratableParagraphs(raw));
  });

  it("strips the horizontal rule separator (---) inside the body", () => {
    const raw = ["Body before.", "", "---", "", "Body after."].join("\n");
    const out = narratableParagraphs(raw);
    expect(out.map((p) => p.text)).toEqual(["Body before.", "Body after."]);
  });
});

describe("pacingPlan", () => {
  it("uses the heading pause after a heading and the paragraph pause otherwise", () => {
    const paras = [
      { index: 0, text: "Heading", isHeading: true },
      { index: 1, text: "Body.", isHeading: false },
      { index: 2, text: "More.", isHeading: false },
    ];
    const plan = pacingPlan(paras);
    expect(plan).toEqual([
      PAUSE_AFTER_HEADING_MS,
      PAUSE_BETWEEN_PARAGRAPHS_MS,
      PAUSE_BETWEEN_PARAGRAPHS_MS,
    ]);
  });

  it("returns one silence value per paragraph", () => {
    const paras = narratableParagraphs(["A.", "", "B.", "", "C."].join("\n"));
    expect(pacingPlan(paras)).toHaveLength(paras.length);
  });

  it("exports sane pause constants (heading pause is longer)", () => {
    expect(PAUSE_AFTER_HEADING_MS).toBeGreaterThan(PAUSE_BETWEEN_PARAGRAPHS_MS);
    expect(PAUSE_BETWEEN_PARAGRAPHS_MS).toBeGreaterThan(0);
  });

  it("handles empty input", () => {
    expect(pacingPlan([])).toEqual([]);
  });
});

describe("frontmatterChannels", () => {
  it("parses flow-style `channels: [\"a\", \"b\"]`", () => {
    const raw = [
      "---",
      'title: "X"',
      'channels: ["finance", "data-science"]',
      "draft: false",
      "---",
      "",
      "Body.",
    ].join("\n");
    expect(frontmatterChannels(raw)).toEqual(["finance", "data-science"]);
  });

  it("parses block-style channels (indented `- item` lines)", () => {
    const raw = [
      "---",
      "title: X",
      "channels:",
      "  - history",
      "  - geopolitics",
      "summary: y",
      "---",
      "",
      "Body.",
    ].join("\n");
    expect(frontmatterChannels(raw)).toEqual(["history", "geopolitics"]);
  });

  it("returns [] when there is no frontmatter or no channels key", () => {
    expect(frontmatterChannels("Just prose, no frontmatter.")).toEqual([]);
    const raw = ["---", 'title: "X"', "draft: false", "---", "", "Body."].join("\n");
    expect(frontmatterChannels(raw)).toEqual([]);
  });

  it("handles single-quoted and bare flow tokens", () => {
    const raw = ["---", "channels: ['tech', ai]", "---", "", "Body."].join("\n");
    expect(frontmatterChannels(raw)).toEqual(["tech", "ai"]);
  });

  it("matches the flagship's real frontmatter", () => {
    const raw = [
      "---",
      'title: "The Arithmetic of Ruin"',
      "format: dispatch",
      'channels: ["finance", "data-science"]',
      "---",
      "",
      "Body.",
    ].join("\n");
    expect(frontmatterChannels(raw)).toEqual(["finance", "data-science"]);
  });
});
