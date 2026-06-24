/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Cloudflare Worker beacon endpoint. Unset/empty → beacon no-ops. */
  readonly PUBLIC_WORKER_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
