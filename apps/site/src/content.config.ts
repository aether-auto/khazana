import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { FORMAT_NAMES, CHANNELS } from "@khazana/core";

// Reuse the core vocab so feed + reads share one taxonomy. zod enums must be
// constructed from a mutable [string, ...string[]] tuple.
const formatEnum = z.enum([...FORMAT_NAMES] as [string, ...string[]]);
const channelEnum = z.enum([...CHANNELS] as [string, ...string[]]);

const blog = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    format: formatEnum,
    channels: z.array(channelEnum).min(1),
    summary: z.string(),
    publishedAt: z.coerce.date(),
    sources: z
      .array(z.object({ title: z.string(), url: z.string().url() }))
      .default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
