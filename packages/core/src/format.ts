import { z } from "zod";
import { FormatNameSchema, type FormatName } from "./vocab.js";

export const FormatSchema = z.object({
  name: FormatNameSchema,
  intent: z.enum(["narrate", "explain", "synthesize", "build", "weigh"]),
  length: z.enum(["brief", "feature"]),
  voiceProfile: z.string(),
  componentKit: z.array(z.string()),
  topics: z.array(z.string()),
  series: z.object({ cadence: z.enum(["daily", "weekly"]), day: z.string().optional() }).optional(),
});
export type Format = z.infer<typeof FormatSchema>;

export const FORMATS: Record<FormatName, Format> = {
  chronicle: {
    name: "chronicle", intent: "narrate", length: "feature",
    voiceProfile: "Immersive present-tense historical-fiction narrative; cited in margin notes, never breaking the spell.",
    componentKit: ["Scrolly", "Annotation", "Timeline", "Map"],
    topics: ["history", "geopolitics", "geography"],
    series: { cadence: "weekly", day: "sunday" },
  },
  dispatch: {
    name: "dispatch", intent: "explain", length: "feature",
    voiceProfile: "Data-driven Pudding/Distill explainer; interactive charts woven into prose, scroll-driven reveals.",
    componentKit: ["Chart", "Scrolly", "DataTable", "Annotation"],
    topics: ["data-science", "ds-sports", "finance", "science", "ai", "quantum"],
  },
  "field-notes": {
    name: "field-notes", intent: "synthesize", length: "brief",
    voiceProfile: "Short sharp briefing: what happened, why it matters to you, links to sources.",
    componentKit: ["Annotation", "DataTable"],
    topics: ["geopolitics", "politics", "tech", "ai", "finance"],
  },
  teardown: {
    name: "teardown", intent: "explain", length: "feature",
    voiceProfile: "Deep 'how X actually works' deconstruction with interactive code and diagrams.",
    componentKit: ["RunnableCode", "Chart", "Annotation"],
    topics: ["tech", "ai", "quantum", "embedded", "data-science"],
  },
  primer: {
    name: "primer", intent: "explain", length: "feature",
    voiceProfile: "Evergreen foundational explainer with interactive sandboxes; timeless, not timely.",
    componentKit: ["RunnableCode", "Chart", "Annotation"],
    topics: ["science", "ai", "quantum", "finance", "data-science"],
  },
  "build-log": {
    name: "build-log", intent: "build", length: "feature",
    voiceProfile: "DIY/project walkthrough: parts, steps, runnable code; powers the Workshop board.",
    componentKit: ["RunnableCode", "DataTable", "Annotation"],
    topics: ["diy", "3d-printing", "iot", "embedded", "ai-projects"],
  },
  theater: {
    name: "theater", intent: "narrate", length: "feature",
    voiceProfile: "Relive a battle, campaign, or strategic contest phase by phase: army movements, orders of battle, force ratios — cinematic yet every unit, strength, and casualty figure traces to real military-history sources.",
    componentKit: ["BattleMap", "OrderOfBattle", "ForceComparison", "Sankey", "Map", "Timeline", "Annotation"],
    topics: ["history", "geopolitics", "politics", "geography"],
  },
};

export function formatsForChannel(channel: string): Format[] {
  return Object.values(FORMATS).filter((f) => f.topics.includes(channel));
}
