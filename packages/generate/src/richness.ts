// packages/generate/src/richness.ts
//
// Deterministic per-draft DENSITY / RICHNESS score — the enforcement half of the
// density mandate that until now was pure prose (`.claude/skills/writers/README.md`
// + every per-format writer SKILL.md's "Density target" paragraph). Nothing
// counted components or islands before a read shipped; this module is that count.
//
// "Knowledge-carrying island" definition (matches every format SKILL's density
// paragraph, which consistently omits the same handful of components from its
// affirmative island list even though they're valuable connective tissue):
// Annotation (inline citation), Sidenote (margin aside), Callout (boxed note),
// Detail (progressive-disclosure wrapper — reveals existing content, doesn't
// carry new structured knowledge), Definition (glossary tooltip), Pullquote
// (verbatim quote block), and StatBand (a numeric callout row — omitted from
// every format's affirmative island list). Everything else in KNOWN_COMPONENTS
// is a knowledge-carrying island: Chart, Diagram, Simulation, Figure, Stepper,
// DataTable, Scrolly, StateMachine, and the rest of the ~40-component kit.
import matter from "gray-matter";
import { KNOWN_COMPONENTS } from "./validate.js";

export const NON_ISLAND_COMPONENTS = [
  "Annotation",
  "Sidenote",
  "Callout",
  "Detail",
  "Definition",
  "Pullquote",
  "StatBand",
] as const;

const NON_ISLAND_SET = new Set<string>(NON_ISLAND_COMPONENTS);
const ISLAND_COMPONENTS = new Set<string>(KNOWN_COMPONENTS.filter((c) => !NON_ISLAND_SET.has(c)));

/** Midpoint of the density mandate's ~800-1,000 words/island band. */
export const WORDS_PER_ISLAND_TARGET = 900;
export const WORDS_PER_ISLAND_TARGET_BAND = { min: 800, max: 1000 } as const;

// field-notes is the deliberate short-digest exception (README.md +
// field-notes/SKILL.md): the length floor, density target, and expanded kit do
// NOT apply to it. Exempt it outright rather than scoring it against a target
// it was never meant to hit.
const EXEMPT_FORMATS = new Set<string>(["field-notes"]);

// EGREGIOUS under-build floor — deliberately conservative. The founder lost a
// whole run to over-strict gating once already, so this must catch only the
// unambiguous cases: a long-form read with FEWER than 2 distinct
// knowledge-carrying components (i.e. 0 or 1) is clearly under-built — all
// prose plus marginalia, or a single repeated chart. Anything at or above 2
// distinct islands is a real (if perhaps below-target) attempt and is only
// ever reported, never hard-failed.
export const EGREGIOUS_DISTINCT_ISLAND_FLOOR = 2;

// The floor only APPLIES once a draft is long enough to plausibly be one of
// the six long-form formats — well below the 5,000-7,000-word floor, but high
// enough that a short/legitimate stub (or a test fixture) never trips it. A
// 200-word snippet with one component isn't "an under-built long-form Read";
// it's something else entirely (or not real content yet).
export const EGREGIOUS_MIN_WORDS = 1500;

export interface RichnessScore {
  format: string;
  /** field-notes — the density mandate does not apply; always non-egregious, always meetsTarget. */
  exempt: boolean;
  words: number;
  distinctIslandComponents: string[];
  /** Total knowledge-carrying component tags, including repeats of the same component. */
  islandInstanceCount: number;
  /** Total component tags of ANY kind (island + marginalia), for context. */
  totalComponentInstances: number;
  /** words / islandInstanceCount; null when there are zero island instances. */
  wordsPerIsland: number | null;
  target: number;
  targetBand: { min: number; max: number };
  /** wordsPerIsland is within (at or below) the target band's max — i.e. dense enough. Always true when exempt. */
  meetsTarget: boolean;
  /** HARD-FAIL condition: a non-exempt format below the conservative distinct-island floor. */
  egregious: boolean;
}

function wordCount(prose: string): number {
  const stripped = prose
    .replace(/^import[^\n]*$/gm, " ") // drop import lines
    .replace(/<[^>]*>/g, " ") // drop JSX/HTML tags (and everything inside, incl. props)
    .replace(/[{}]/g, " ");
  return stripped.split(/\s+/).filter(Boolean).length;
}

function componentTags(body: string): string[] {
  const tags: string[] = [];
  for (const m of body.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)) tags.push(m[1]!);
  return tags;
}

export function computeRichness(mdx: string): RichnessScore {
  let format = "unknown";
  let content = mdx;
  try {
    const parsed = matter(mdx);
    content = parsed.content;
    if (typeof parsed.data?.format === "string") format = parsed.data.format;
  } catch {
    // Unparseable frontmatter: score the raw text so a broken draft is
    // reported (and, being non-exempt, can still trip the egregious floor)
    // rather than silently excused.
  }

  const exempt = EXEMPT_FORMATS.has(format);
  const words = wordCount(content);
  const tags = componentTags(content);
  const islandTags = tags.filter((t) => ISLAND_COMPONENTS.has(t));
  const distinctIslandComponents = [...new Set(islandTags)].sort();
  const islandInstanceCount = islandTags.length;
  const wordsPerIsland = islandInstanceCount > 0 ? words / islandInstanceCount : null;
  const meetsTarget = exempt || (wordsPerIsland !== null && wordsPerIsland <= WORDS_PER_ISLAND_TARGET_BAND.max);
  const egregious =
    !exempt && words >= EGREGIOUS_MIN_WORDS && distinctIslandComponents.length < EGREGIOUS_DISTINCT_ISLAND_FLOOR;

  return {
    format,
    exempt,
    words,
    distinctIslandComponents,
    islandInstanceCount,
    totalComponentInstances: tags.length,
    wordsPerIsland,
    target: WORDS_PER_ISLAND_TARGET,
    targetBand: WORDS_PER_ISLAND_TARGET_BAND,
    meetsTarget,
    egregious,
  };
}
