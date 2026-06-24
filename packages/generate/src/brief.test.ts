import { expect, test } from "vitest";
import { FORMATS, type FeedItem } from "@khazana/core";
import type { Assignment } from "./select.js";
import { buildBrief } from "./brief.js";

function item(id: string, title: string, url: string): FeedItem {
  return {
    id,
    source: "src",
    sourceType: "rss",
    url,
    title,
    publishedAt: "2026-06-22T00:00:00.000Z",
    fetchedAt: "2026-06-22T00:00:00.000Z",
    topics: ["ai"],
    entities: [],
    summary: `Summary of ${title}.`,
    media: [],
    kind: "link",
  };
}

const assignment: Assignment = {
  slug: "openai-ships-gpt-5-abc123",
  format: "dispatch",
  channel: "ai",
  title: "OpenAI ships GPT-5",
  sourceItemIds: ["s1", "s2"],
  length: "feature",
  rationale: "top cluster",
  column: false,
};

const items: FeedItem[] = [
  item("s1", "GPT-5 launch", "https://e.com/1"),
  item("s2", "Agentic tool use", "https://e.com/2"),
  item("x9", "Unrelated", "https://e.com/9"),
];

const STYLE = "## Voice\nConfident, curious, precise.";

test("brief is deterministic", () => {
  expect(buildBrief(assignment, items, STYLE)).toBe(buildBrief(assignment, items, STYLE));
});

test("brief injects the format voiceProfile and the STYLE.md voice", () => {
  const brief = buildBrief(assignment, items, STYLE);
  expect(brief).toContain(FORMATS.dispatch.voiceProfile);
  expect(brief).toContain("Confident, curious, precise.");
});

test("brief embeds the exact frontmatter spec with the slug, format, channel", () => {
  const brief = buildBrief(assignment, items, STYLE);
  expect(brief).toContain("format: dispatch");
  expect(brief).toContain("channels:");
  expect(brief).toContain("- ai");
  expect(brief).toContain("publishedAt:");
  expect(brief).toContain("sources:"); // the {title,url} array spec
  expect(brief).toContain("title:");
  expect(brief).toContain("summary:");
});

test("brief lists ONLY the assignment's source items with id + url + summary", () => {
  const brief = buildBrief(assignment, items, STYLE);
  expect(brief).toContain("s1");
  expect(brief).toContain("https://e.com/1");
  expect(brief).toContain("Summary of GPT-5 launch.");
  expect(brief).toContain("s2");
  expect(brief).toContain("https://e.com/2");
  // unrelated item is NOT included
  expect(brief).not.toContain("x9");
  expect(brief).not.toContain("https://e.com/9");
});

test("brief lists the format componentKit and mandates grounding/citation", () => {
  const brief = buildBrief(assignment, items, STYLE);
  for (const c of FORMATS.dispatch.componentKit) expect(brief).toContain(c);
  // explicit grounding mandate
  expect(brief.toLowerCase()).toContain("cite");
  expect(brief.toLowerCase()).toContain("every");
  expect(brief.toLowerCase()).toContain("source");
  // prefer interactive components over prose-only
  expect(brief.toLowerCase()).toContain("interactive");
});
