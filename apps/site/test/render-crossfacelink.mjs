// Standalone SSR-render harness for the inline `<CrossFaceLink>` tell
// (faces-cross-face-moments plan). Same rationale as render-shell-faces.mjs:
// Vitest 2.1.9's bundled Vite can't load Astro 5.18's `getViteConfig`, so this
// spawns a CLEAN Node process, boots Astro's own Vite dev server in middleware
// mode, and ssrLoadModule's `_inner-render.mjs` (which resolves every `astro:`
// virtual module) to render the component. Prints JSON { toAtlas, toStudy } to
// stdout — nothing else may write to stdout, the test harness parses it raw.
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getViteConfig } from "astro/config";

const require = createRequire(import.meta.url);
const astroDir = dirname(require.resolve("astro/package.json"));
const vitePath = require.resolve("vite", { paths: [astroDir] });
const { createServer } = await import(vitePath);

const siteRoot = fileURLToPath(new URL("..", import.meta.url));

async function main() {
  const cfgFn = getViteConfig({}, { root: siteRoot });
  const cfg = await cfgFn({ mode: "development", command: "serve" });
  const silentLogger = {
    info() {},
    warn() {},
    warnOnce() {},
    error() {},
    clearScreen() {},
    hasErrorLogged() {
      return false;
    },
    hasWarned: false,
  };
  const server = await createServer({
    ...cfg,
    root: siteRoot,
    server: { middlewareMode: true },
    logLevel: "silent",
    customLogger: silentLogger,
    optimizeDeps: { noDiscovery: true, include: [] },
  });

  try {
    const mod = await server.ssrLoadModule("/test/_inner-render.mjs");
    const out = await mod.renderCrossFaceLinks();
    process.stdout.write(JSON.stringify(out));
  } finally {
    await server.close();
  }
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
