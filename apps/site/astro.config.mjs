// @ts-check
import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

// $0 GitHub Pages project pages: site + base are env-configurable with safe defaults.
// PUBLIC_SITE_URL e.g. "https://arnavmarda.github.io"; PUBLIC_BASE_PATH e.g. "/khazana".
const site = process.env.PUBLIC_SITE_URL || "https://example.com";
const base = process.env.PUBLIC_BASE_PATH || "/";

// `@khazana/core`'s feed-item.ts imports `createHash` from `node:crypto` for the
// build-only `makeFeedItemId`. The site never calls it (it validates curated.json,
// it doesn't mint ids), but a client island importing any core value would pull the
// bare `node:crypto` import into the browser bundle, where Vite's external stub has
// no `createHash` → build break. Alias it to a resolvable browser shim. Safe app-
// wide here because the site never invokes makeFeedItemId at SSR or in the client.
const cryptoShim = fileURLToPath(new URL("./src/lib/crypto-browser-shim.ts", import.meta.url));

export default defineConfig({
  site,
  base,
  output: "static",
  trailingSlash: "ignore",
  integrations: [react(), mdx()],
  // Markdown/MDX pipeline. @astrojs/mdx inherits this `markdown` config by
  // default (extendMarkdownConfig defaults true), so remark-math/rehype-katex
  // and the brand-themed Shiki apply to BOTH .md and .mdx Reads uniformly.
  markdown: {
    // Real typeset math: remark-math parses `$…$` / `$$…$$`, rehype-katex
    // renders it to KaTeX HTML at BUILD time (zero runtime JS). KaTeX CSS +
    // fonts are bundled offline (imported in global.css) — never a CDN.
    remarkPlugins: [remarkMath],
    // rehype-katex renders typeset math to KaTeX HTML at build time.
    rehypePlugins: [rehypeKatex],
    // Brand-themed code highlighting. `css-variables` makes Shiki emit
    // `--astro-code-*` custom properties instead of hard-coded colors; we map
    // those to the Observatory palette in code.css, so highlighting matches the
    // amber/clay system AND flips automatically with dark/light. One theme,
    // tokens-driven — the uniformity guarantee.
    shikiConfig: {
      theme: "css-variables",
      wrap: false,
    },
  },
  build: { assets: "_assets" },
  // Image handling for the <Figure> primitive. Astro's default optimizer needs
  // the native `sharp` binary, which is NOT bundled in this $0/CI environment
  // (a MissingSharp build error otherwise). The built-in `passthrough` service
  // keeps astro:assets `<Image>` fully working — it still emits width/height
  // (no CLS), lazy loading, and fingerprinted local assets — it just skips
  // format re-encoding (avif/webp). No new dependency, no runtime network,
  // fully offline: the committed source asset is copied through as-is.
  image: { service: { entrypoint: "astro/assets/services/noop" } },
  vite: {
    resolve: {
      alias: [{ find: /^node:crypto$/, replacement: cryptoShim }],
    },
  },
});
