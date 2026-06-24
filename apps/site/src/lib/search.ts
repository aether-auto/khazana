// Thin Pagefind wrapper. The pure `mapPagefindResult` is TDD'd offline; the
// runtime loader is injectable so tests never touch Pagefind or the network.
// Pagefind is a BUILD-TIME index (postbuild: `pagefind --site dist`). Its bundle
// only exists after a full build; in dev / pre-build the dynamic import fails and
// `loadPagefind` resolves to null so callers degrade gracefully.

export interface RawPagefindResult {
  url: string;
  meta?: { title?: string } | undefined;
  excerpt?: string | undefined;
}

export interface SearchResult {
  url: string;
  title: string;
  excerpt: string;
}

/** Derive a readable title from a URL path when Pagefind has no meta.title. */
function titleFromUrl(url: string): string {
  const path = String(url || "")
    .split(/[?#]/)[0]
    .replace(/\/+$/, ""); // drop trailing slash(es)
  const segments = path.split("/").filter(Boolean);
  // A single-segment path is the site root (possibly with a base prefix); treat as "home".
  if (segments.length <= 1) return "home";
  return segments[segments.length - 1];
}

/** Pure: Pagefind result payload → our SearchResult. Total, never throws. */
export function mapPagefindResult(raw: RawPagefindResult): SearchResult {
  const url = String(raw?.url ?? "");
  const title = raw?.meta?.title?.trim() || titleFromUrl(url);
  const excerpt = String(raw?.excerpt ?? "");
  return { url, title, excerpt };
}

// --- Runtime glue (not unit-tested; exercised by the build + manual QA) ---

export interface PagefindApi {
  search(query: string): Promise<{ results: { data(): Promise<RawPagefindResult> }[] }>;
}

export interface LoadOpts {
  /** Base path (GitHub Pages project base). Defaults to import.meta.env.BASE_URL. */
  base?: string;
  /** Injectable importer for testing/SSR; defaults to a dynamic import. */
  importer?: (specifier: string) => Promise<unknown>;
}

/**
 * Dynamically load the Pagefind bundle from the site's own /pagefind/ dir.
 * Returns null (not throws) when the index isn't built — dev or pre-postbuild.
 */
export async function loadPagefind(opts: LoadOpts = {}): Promise<PagefindApi | null> {
  const base = (opts.base ?? "/").replace(/\/$/, "");
  const specifier = `${base}/pagefind/pagefind.js`;
  const importer = opts.importer ?? ((s: string) => import(/* @vite-ignore */ s));
  try {
    const mod = (await importer(specifier)) as PagefindApi & { init?: () => Promise<void> };
    await mod.init?.();
    return mod;
  } catch {
    return null; // index not built yet — caller shows a graceful state
  }
}

/** Run a query and map results. Empty query → []. Caps to `limit`. */
export async function search(
  api: PagefindApi,
  query: string,
  limit = 8,
): Promise<SearchResult[]> {
  const q = query.trim();
  if (q === "") return [];
  const { results } = await api.search(q);
  const top = results.slice(0, limit);
  const data = await Promise.all(top.map((r) => r.data()));
  return data.map(mapPagefindResult);
}
