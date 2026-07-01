import { expect, test } from "vitest";
import { FORMATS, type CitationLedger, type FeedItem } from "@khazana/core";
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

test("brief drops the closed-corpus 'use ONLY these items' restriction, mandates research", () => {
  const brief = buildBrief(assignment, items, STYLE);
  expect(brief).not.toContain("Use ONLY these items");
  expect(brief.toLowerCase()).toContain("citation ledger");
  expect(brief.toLowerCase()).toContain("research");
  // triangulation / corroboration discipline
  expect(brief.toLowerCase()).toMatch(/corroborat|independent sources/);
});

test("brief inlines FULL curated source text when a body is present", () => {
  const withBody: FeedItem[] = [
    { ...item("s1", "GPT-5 launch", "https://e.com/1"), body: "The FULL body of the article, all of it." },
    item("s2", "Agentic tool use", "https://e.com/2"),
  ];
  const brief = buildBrief(assignment, withBody, STYLE);
  expect(brief).toContain("The FULL body of the article, all of it.");
  expect(brief.toLowerCase()).toContain("full text");
  // s2 has no body -> falls back to its summary
  expect(brief).toContain("Summary of Agentic tool use.");
});

test("brief carries the research dossier and citation ledger when provided", () => {
  const ledger: CitationLedger = [
    { url: "https://academic.oup.com/mnras/1859", title: "MNRAS 1859", tier: "high", origin: "researched" },
    { url: "https://e.com/1", title: "GPT-5 launch", tier: "med", origin: "curated" },
  ];
  const brief = buildBrief(assignment, items, STYLE, {
    researchDossier: "Q1: What happened in 1859? Finding: the Carrington super-flare.",
    citationLedger: ledger,
  });
  expect(brief).toContain("Q1: What happened in 1859? Finding: the Carrington super-flare.");
  expect(brief).toContain("https://academic.oup.com/mnras/1859");
  expect(brief).toContain("MNRAS 1859");
  expect(brief).toContain("HIGH");
  // frontmatter sources seed is drawn from the ledger, incl the researched url
  expect(brief).toContain('url: "https://academic.oup.com/mnras/1859"');
});

test("brief is deterministic with research inputs", () => {
  const research = {
    researchDossier: "dossier",
    citationLedger: [{ url: "https://e.com/1", title: "A", tier: "high", origin: "curated" }] as CitationLedger,
  };
  expect(buildBrief(assignment, items, STYLE, research)).toBe(buildBrief(assignment, items, STYLE, research));
});
