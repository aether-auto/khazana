import { z } from "zod";

export const CHANNELS = [
  "history", "geopolitics", "politics", "geography", "science", "tech",
  "ai", "quantum", "data-science", "ds-sports", "data-strategy", "finance",
  "ideas", "diy", "3d-printing", "iot", "embedded", "ai-projects",
] as const;
export const ChannelSchema = z.enum(CHANNELS);
export type Channel = z.infer<typeof ChannelSchema>;

export const SOURCE_TYPES = ["reddit", "hn", "rss", "eng-blog", "arxiv", "x", "news", "youtube", "podcast"] as const;
export const SourceTypeSchema = z.enum(SOURCE_TYPES);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const ITEM_KINDS = ["link", "discussion", "paper", "idea", "video", "audio"] as const;
export const ItemKindSchema = z.enum(ITEM_KINDS);
export type ItemKind = z.infer<typeof ItemKindSchema>;

export const FORMAT_NAMES = [
  "chronicle", "dispatch", "field-notes", "teardown", "primer", "build-log", "theater",
] as const;
export const FormatNameSchema = z.enum(FORMAT_NAMES);
export type FormatName = z.infer<typeof FormatNameSchema>;

// --- World Data Spine vocabularies (2026-07-07-world-data-spine-design.md) ---

// §3.1 — license ceiling a source permits
export const LICENSE_TIERS = ["redistribute-raw-ok", "derived-only"] as const;
export const LicenseTierSchema = z.enum(LICENSE_TIERS);
export type LicenseTier = z.infer<typeof LicenseTierSchema>;

// §3.2 — indicator field taxonomy
export const INDICATOR_FIELDS = [
  "macro", "governance", "corruption", "wellbeing",
  "procurement", "fiscal", "elections", "conflict",
] as const;
export const IndicatorFieldSchema = z.enum(INDICATOR_FIELDS);
export type IndicatorField = z.infer<typeof IndicatorFieldSchema>;

// §3.5 — world-event category + severity
export const WORLD_EVENT_CATEGORIES = [
  "conflict", "diplomacy", "politics", "economy", "disaster", "society", "science-tech",
] as const;
export const WorldEventCategorySchema = z.enum(WORLD_EVENT_CATEGORIES);
export type WorldEventCategory = z.infer<typeof WorldEventCategorySchema>;

export const EVENT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const EventSeveritySchema = z.enum(EVENT_SEVERITIES);
export type EventSeverity = z.infer<typeof EventSeveritySchema>;

// §3.4 — reference bias raters
export const REFERENCE_RATERS = ["allsides", "adfontes", "mbfc"] as const;
export const ReferenceRaterSchema = z.enum(REFERENCE_RATERS);
export type ReferenceRater = z.infer<typeof ReferenceRaterSchema>;

// §3.7 — refresh cadence lanes
export const CADENCE_LANES = ["fast", "medium", "slow"] as const;
export const CadenceLaneSchema = z.enum(CADENCE_LANES);
export type CadenceLane = z.infer<typeof CadenceLaneSchema>;

// --- Atlas Government Structure vocabularies (2026-07-07-atlas-government-structure-design.md §3) ---

// §3.1 — classified system type
export const SYSTEM_TYPES = [
  "parliamentary", "presidential", "semi-presidential",
  "constitutional-monarchy", "absolute-monarchy",
  "one-party", "military-junta", "directorial", "provisional", "other",
] as const;
export const SystemTypeSchema = z.enum(SYSTEM_TYPES);
export type SystemType = z.infer<typeof SystemTypeSchema>;

// §3.1 — the branches of government an institution belongs to
export const GOV_BRANCHES = ["executive", "legislative", "judicial", "electoral", "other"] as const;
export const GovBranchSchema = z.enum(GOV_BRANCHES); // "electoral" for Latin-American-style 4th-branch electoral courts
export type GovBranch = z.infer<typeof GovBranchSchema>;

// §3.1 — federal levels; "national" = union/central
export const GOV_TIERS = ["national", "state", "local"] as const;
export const GovTierSchema = z.enum(GOV_TIERS);
export type GovTier = z.infer<typeof GovTierSchema>;

// §3.1 — institution kind taxonomy
export const INSTITUTION_KINDS = [
  "head-of-state", "head-of-government", "cabinet", "chamber",
  "apex-court", "constitutional-court", "election-authority",
  "subnational-executive", "subnational-legislature", "other",
] as const;
export const InstitutionKindSchema = z.enum(INSTITUTION_KINDS);
export type InstitutionKind = z.infer<typeof InstitutionKindSchema>;

// §3.1 — the directed authority relations that bind institutions, charter's 8 core
export const POWER_RELATIONS = [
  "appoints", "dismisses", "confirms", "dissolves",
  "vetoes", "reviews", "elects", "confidence", // "confidence": TO holds the confidence of / can unseat FROM
] as const;
export const PowerRelationSchema = z.enum(POWER_RELATIONS);
export type PowerRelation = z.infer<typeof PowerRelationSchema>;

// §3.1 — how an office-holder is selected
export const SELECTION_METHODS = [
  "direct-election", "indirect-election", "hereditary",
  "appointment", "ex-officio", "legislature-elected", "mixed", "other",
] as const;
export const SelectionMethodSchema = z.enum(SELECTION_METHODS);
export type SelectionMethod = z.infer<typeof SelectionMethodSchema>;
