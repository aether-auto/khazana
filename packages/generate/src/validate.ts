import matter from "gray-matter";
import { z } from "zod";
import { CHANNELS, FORMAT_NAMES, SourceOriginSchema, SourceTierSchema } from "@khazana/core";
import { lintMdxJsxAttributes } from "./mdx-lint.js";
import { checkNumericConsistency } from "./numeric-consistency.js";

// Mirrors apps/site/src/content.config.ts `blog` collection EXACTLY so generated
// MDX builds under astro:content. Field names + constraints must not drift.
const formatEnum = z.enum([...FORMAT_NAMES] as [string, ...string[]]);
const channelEnum = z.enum([...CHANNELS] as [string, ...string[]]);

export const BlogFrontmatterSchema = z.object({
  title: z.string(),
  format: formatEnum,
  channels: z.array(channelEnum).min(1),
  summary: z.string(),
  publishedAt: z.coerce.date(),
  sources: z
    .array(
      z.object({
        title: z.string(),
        url: z.string().url(),
        // OPTIONAL — see content.config.ts for why (ledger tier/origin, baked
        // into the committed frontmatter since the ledger itself is ephemeral).
        tier: SourceTierSchema.optional(),
        origin: SourceOriginSchema.optional(),
      }),
    )
    .default([]),
  draft: z.boolean().default(false),
});
export type BlogFrontmatter = z.infer<typeof BlogFrontmatterSchema>;

// Retired components that MUST NOT be authored. NarrativeScene was confirmed at
// 0 live uses across content/blog/*.mdx and its export was removed from the
// barrel entirely (apps/site/src/components/mdx/index.ts) — not merely blocked
// here. It stays in this list as a permanent name-reservation: so it can never
// be silently re-added to KNOWN_COMPONENTS, and so an old MDX file that still
// references it fails validation with a clear "unknown component" error.
export const RETIRED_COMPONENTS = ["NarrativeScene"] as const;

// Single source of truth for authorable MDX components. This MUST stay in sync
// with the live kit exported from apps/site/src/components/mdx/index.ts (minus
// RETIRED_COMPONENTS). The `component allow-list matches the mdx barrel` test in
// validate.test.ts fails if this list drifts from the barrel.
export const KNOWN_COMPONENTS = [
  "Annotation",
  "Chart",
  "Timeline",
  "DataTable",
  "Scrolly",
  "ScrollyStep",
  "ScrollyTimeline",
  "RunnableCode",
  "Map",
  "ControlledChart",
  "KellyChart",
  "Model3D",
  "Sidenote",
  "DrawChart",
  "StatBand",
  "Pullquote",
  // P0 wave: image + math primitives + shared connective tissue.
  "Figure",
  "Math",
  "Callout",
  "Detail",
  "Definition",
  // P1 wave: knowledge-carrier + teardown/build primitives.
  "Diagram",
  "Simulation",
  "Stepper",
  "Quiz",
  "CodeWalkthrough",
  "AnnotatedFigure",
  // P2 wave: dispatch data-viz depth + chronicle visuals.
  "SmallMultiples",
  "Distribution",
  "Scatter",
  "Slopegraph",
  "RangePlot",
  "CompareSlider",
  "CastGrid",
  "EventCascade",
  // P3 wave: teardown/primer + build-log + chronicle/dispatch kit.
  "StateMachine",
  "LayerStack",
  "Checklist",
  "GanttStrip",
  "RouteMap",
  // X + military/strategy wave: flow diagram + theater kit.
  "Sankey",
  "BattleMap",
  "OrderOfBattle",
  "ForceComparison",
  // X wave: generalized reader-controlled model.
  "ParameterPlay",
  // Atlas Government Structure wave: power-flow diagram.
  "PowerFlow",
  // Two Faces wave: inline cross-face citation tell.
  "CrossFaceLink",
] as const;

export interface DraftResult {
  ok: boolean;
  slug: string;
  errors: string[];
}

function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Component names used in JSX (<Foo ...>) and imported from the mdx barrel.
function usedComponentNames(body: string): Set<string> {
  const names = new Set<string>();
  for (const m of body.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)) names.add(m[1]!);
  for (const m of body.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'][^"']*mdx["']/g)) {
    for (const part of m[1]!.split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0]!.trim();
      if (/^[A-Z]/.test(name)) names.add(name);
    }
  }
  return names;
}

export function validateDraft(
  mdx: string,
  knownSourceUrls: ReadonlySet<string>,
  knownComponents: readonly string[] = KNOWN_COMPONENTS,
): DraftResult {
  const errors: string[] = [];

  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(mdx);
  } catch {
    return { ok: false, slug: "unknown", errors: ["frontmatter: failed to parse"] };
  }

  const fm = parsed.data;
  if (!fm || Object.keys(fm).length === 0) {
    return { ok: false, slug: "unknown", errors: ["frontmatter: missing or empty"] };
  }

  const result = BlogFrontmatterSchema.safeParse(fm);
  let slug = "unknown";
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`frontmatter ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    if (typeof fm.title === "string") slug = slugFromTitle(fm.title);
  } else {
    const data = result.data;
    slug = slugFromTitle(data.title);

    // Grounding: at least one source, each url traceable to a known FeedItem.
    if (data.sources.length === 0) {
      errors.push("sources: at least one cited source is required (grounding)");
    }
    for (const src of data.sources) {
      if (!knownSourceUrls.has(src.url)) {
        errors.push(`grounding: source url not in known sources: ${src.url}`);
      }
    }
  }

  // Components: every used/imported component must be in the allow-list.
  const allowed = new Set(knownComponents);
  for (const name of usedComponentNames(parsed.content)) {
    if (!allowed.has(name)) errors.push(`component: unknown component <${name}>`);
  }

  // MDX/JSX syntax: catch inner straight/backslash-escaped quotes in attribute
  // values (the recurring build-breaker astro:content rejects). Runs on the full
  // mdx so line numbers match the file (frontmatter offset preserved).
  for (const issue of lintMdxJsxAttributes(mdx)) {
    errors.push(`mdx-syntax: line ${issue.line}:${issue.column}: ${issue.message}`);
  }

  // Numeric consistency: catch the "one-shot fix left a stale copy elsewhere"
  // defect class — the same labeled quantity rendered with different values
  // in different places (table vs prose, chart vs prose, two components).
  // Deterministic, no LLM — see numeric-consistency.ts for scope/precision notes.
  for (const finding of checkNumericConsistency(mdx)) {
    errors.push(`numeric-consistency: ${finding.message}`);
  }

  return { ok: errors.length === 0, slug, errors };
}
