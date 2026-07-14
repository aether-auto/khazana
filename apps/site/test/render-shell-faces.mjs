// Standalone SSR-render harness for the two-face atmosphere layer.
//
// WHY a separate process: Vitest 2.1.9's bundled Vite can't load Astro 5.18's
// `getViteConfig` plugin set (it throws an opaque "[object Object]" at config
// time). Astro's OWN Vite, however, SSR-renders Shell.astro perfectly. So
// Shell.ssr.test.ts spawns THIS script in a clean Node process — fully isolated
// from Vitest's module system — and asserts on the JSON it prints to stdout.
//
// The actual Container render happens INSIDE Vite's SSR runtime (via
// `ssrLoadModule("/test/_inner-render.mjs")`), not here. That matters: Shell
// pulls in `astro:transitions` (ClientRouter) and other `astro:` virtual
// modules that only resolve inside Vite's module runner — evaluating the
// container in this outer Node context leaks `astro:` specifiers to Node's ESM
// loader and throws ERR_UNSUPPORTED_ESM_URL_SCHEME. Keeping the whole render in
// the SSR runtime resolves every virtual. Output: JSON
// { studyDefault, studyExplicit, atlas }.
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getViteConfig } from "astro/config";

const require = createRequire(import.meta.url);
// Resolve Vite from Astro's own dependency tree so we always use the exact Vite
// major Astro 5.18 ships with — never a hash-pinned path that drifts on update.
const astroDir = dirname(require.resolve("astro/package.json"));
const vitePath = require.resolve("vite", { paths: [astroDir] });
const { createServer } = await import(vitePath);

const siteRoot = fileURLToPath(new URL("..", import.meta.url));

async function main() {
  const cfgFn = getViteConfig({}, { root: siteRoot });
  const cfg = await cfgFn({ mode: "development", command: "serve" });
  // A fully-muted logger: Vite's dep optimizer writes "[vite] Re-optimizing
  // dependencies…" to STDOUT even at logLevel "silent", which would corrupt the
  // JSON we emit on stdout. Swallow everything — stdout must carry ONLY JSON.
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
    const out = await mod.renderFaces();
    process.stdout.write(JSON.stringify(out));
  } finally {
    await server.close();
  }
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
