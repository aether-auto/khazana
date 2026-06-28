// Browser shim for the one `node:crypto` symbol `@khazana/core`'s feed-item.ts
// imports: `createHash`. That function (`makeFeedItemId`) is pipeline/build-only
// and is NEVER called in the browser — but the bare import would otherwise resolve
// to Vite's `__vite-browser-external` stub, which has no `createHash`, breaking the
// client bundle the moment a client island imports any core value. This provides a
// resolvable `createHash` so the import succeeds; calling it in the browser throws
// loudly (it should never happen). Wired via a Vite resolve alias in astro.config.
class ShimHash {
  update(): this {
    throw new Error("createHash is not available in the browser (build-time only)");
  }
  digest(): string {
    throw new Error("createHash is not available in the browser (build-time only)");
  }
}

export function createHash(): ShimHash {
  return new ShimHash();
}

export default { createHash };
