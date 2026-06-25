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
  "chronicle", "dispatch", "field-notes", "teardown", "primer", "build-log",
] as const;
export const FormatNameSchema = z.enum(FORMAT_NAMES);
export type FormatName = z.infer<typeof FormatNameSchema>;
