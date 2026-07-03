/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Cloudflare Worker beacon endpoint. Unset/empty → beacon no-ops. */
  readonly PUBLIC_WORKER_URL?: string;
  /**
   * Expected PBKDF2-SHA256 (lowercase-hex) digest for the site access gate.
   * Unset/empty → no gate rendered (site behaves exactly as today). Generate
   * with `pnpm tsx scripts/site-gate-hash.mts <password>`.
   */
  readonly PUBLIC_SITE_GATE_HASH?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
