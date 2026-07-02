// apps/site/src/components/mdx/lib/cast-grid.ts
// Pure logic for CastGrid — member normalization (trim, safe fallbacks) so the
// Astro component just maps over ready-to-render cards. DOM-free + unit-tested.

export interface CastMember {
  /** The person/place/faction's name (Fraunces display). */
  name: string;
  /** Their role in the narrative (mono, --ink-label). */
  role: string;
  /** Optimized portrait src string (from getImage()). Optional. */
  img?: string;
  /** The revealed note — who they are / why they matter. */
  note: string;
  /** Grounding: ledger / provenance URL for this figure. */
  sourceUrl?: string;
}

export interface NormalizedCastMember extends CastMember {
  /** 1-based index across the cast (for stable keys / labels). */
  n: number;
  /** True when a portrait src was supplied (cards render fine without one). */
  hasImg: boolean;
}

/**
 * Normalize the cast list: number each member 1-based, trim strings, and flag
 * whether a portrait is present. Empty/whitespace img → treated as absent so a
 * card without a real portrait renders the name-only variant (never a broken
 * <img>). Members missing a name or note are kept but coerced to "" so the grid
 * never throws on partial author input (the SSR test asserts they still render).
 */
export function normalizeCast(cast: CastMember[]): NormalizedCastMember[] {
  return (cast ?? []).map((m, i) => {
    const img = typeof m.img === "string" ? m.img.trim() : "";
    return {
      name: (m.name ?? "").trim(),
      role: (m.role ?? "").trim(),
      note: (m.note ?? "").trim(),
      img: img || undefined,
      sourceUrl: m.sourceUrl,
      n: i + 1,
      hasImg: img.length > 0,
    };
  });
}
