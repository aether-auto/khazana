// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

// $0 GitHub Pages project pages: site + base are env-configurable with safe defaults.
// PUBLIC_SITE_URL e.g. "https://arnavmarda.github.io"; PUBLIC_BASE_PATH e.g. "/khazana".
const site = process.env.PUBLIC_SITE_URL || "https://example.com";
const base = process.env.PUBLIC_BASE_PATH || "/";

export default defineConfig({
  site,
  base,
  output: "static",
  trailingSlash: "ignore",
  integrations: [mdx()],
  build: { assets: "_assets" },
});
