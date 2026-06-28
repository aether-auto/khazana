// @ts-check
import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";

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
  build: { assets: "_assets" },
  vite: {
    resolve: {
      alias: [{ find: /^node:crypto$/, replacement: cryptoShim }],
    },
  },
});
