// Pure, deterministic graph model: curated items + flagship posts linked by
// shared topics/entities. No d3, no DOM, no randomness. Stable node/edge order.

export interface GraphItem {
  id: string;
  title: string;
  topics: string[];
  entities: string[];
  url: string;
}
export interface GraphPost {
  slug: string;
  title: string;
  channels: string[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: "item" | "post";
  /** Link target: external url for items, /reads/<slug> for posts (filled by caller via href). */
  href: string;
  degree: number;
}
export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}
export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface BuildGraphOpts {
  minShared?: number; // default 2
  maxNodes?: number; // default 60
  /** Base for post hrefs (e.g. "/khazana"); items use their own url. */
  base?: string;
}

interface Raw {
  id: string;
  label: string;
  type: "item" | "post";
  href: string;
  tags: Set<string>; // topics ∪ entities (items) or channels (posts)
}

export function buildGraph(
  items: ReadonlyArray<GraphItem>,
  posts: ReadonlyArray<GraphPost>,
  opts: BuildGraphOpts = {},
): GraphModel {
  const minShared = opts.minShared ?? 2;
  const maxNodes = opts.maxNodes ?? 60;
  const base = (opts.base ?? "").replace(/\/$/, "");

  const raw: Raw[] = [
    ...items.map((it): Raw => ({
      id: it.id,
      label: it.title,
      type: "item",
      href: it.url,
      tags: new Set<string>([...it.topics, ...it.entities]),
    })),
    ...posts.map((p): Raw => ({
      id: p.slug,
      label: p.title,
      type: "post",
      href: `${base}/reads/${p.slug}`,
      tags: new Set<string>(p.channels),
    })),
  ];

  // Candidate edges (i<j in raw order), keyed by sorted id pair for stability.
  const edges: GraphEdge[] = [];
  for (let i = 0; i < raw.length; i++) {
    for (let j = i + 1; j < raw.length; j++) {
      let shared = 0;
      for (const t of raw[i].tags) if (raw[j].tags.has(t)) shared++;
      if (shared >= minShared) {
        const [source, target] =
          raw[i].id < raw[j].id ? [raw[i].id, raw[j].id] : [raw[j].id, raw[i].id];
        edges.push({ source, target, weight: shared });
      }
    }
  }

  // Degree per node (for the maxNodes cap + render sizing).
  const degree = new Map<string, number>();
  for (const r of raw) degree.set(r.id, 0);
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }

  // Cap: keep highest-degree nodes; tie-break by original order (stable).
  const order = new Map(raw.map((r, i) => [r.id, i]));
  let kept = raw;
  if (raw.length > maxNodes) {
    kept = [...raw]
      .sort((a, b) => {
        const da = degree.get(b.id)! - degree.get(a.id)!;
        return da !== 0 ? da : order.get(a.id)! - order.get(b.id)!;
      })
      .slice(0, maxNodes)
      .sort((a, b) => order.get(a.id)! - order.get(b.id)!); // restore stable order
  }
  const keptIds = new Set(kept.map((r) => r.id));

  const nodes: GraphNode[] = kept.map((r) => ({
    id: r.id,
    label: r.label,
    type: r.type,
    href: r.href,
    degree: degree.get(r.id) ?? 0,
  }));

  const prunedEdges = edges
    .filter((e) => keptIds.has(e.source) && keptIds.has(e.target))
    .sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target));

  return { nodes, edges: prunedEdges };
}
