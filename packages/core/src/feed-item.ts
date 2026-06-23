import { createHash } from "node:crypto";
import { z } from "zod";
import { ItemKindSchema, SourceTypeSchema } from "./vocab.js";

export const MediaRefSchema = z.object({
  type: z.enum(["image", "video", "chart", "audio"]),
  url: z.string().url(),
  alt: z.string().optional(),
});
export type MediaRef = z.infer<typeof MediaRefSchema>;

export const FeedItemSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceType: SourceTypeSchema,
  url: z.string().url(),
  title: z.string(),
  author: z.string().optional(),
  publishedAt: z.string().datetime(),
  fetchedAt: z.string().datetime(),
  topics: z.array(z.string()).default([]),
  entities: z.array(z.string()).default([]),
  summary: z.string().default(""),
  body: z.string().optional(),
  media: z.array(MediaRefSchema).default([]),
  metrics: z.object({ score: z.number().optional(), comments: z.number().optional() }).optional(),
  clusterId: z.string().optional(),
  tasteScore: z.number().optional(),
  trustScore: z.number().min(0).max(1).optional(),
  kind: ItemKindSchema,
});
export type FeedItem = z.infer<typeof FeedItemSchema>;

export function makeFeedItemId(sourceType: string, url: string): string {
  return createHash("sha1").update(`${sourceType}::${url}`).digest("hex").slice(0, 16);
}
