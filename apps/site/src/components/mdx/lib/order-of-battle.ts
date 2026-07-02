// apps/site/src/components/mdx/lib/order-of-battle.ts
// Pure logic for OrderOfBattle — roster normalization (trim, tone defaulting,
// stable ids) so the Astro component just maps over ready-to-render sides. No
// DOM, no dep, unit-tested. Mirrors cast-grid.ts in spirit.

export type Tone = "friendly" | "enemy" | "neutral";
export type FormationKind =
  | "army"
  | "corps"
  | "division"
  | "brigade"
  | "regiment"
  | "fleet"
  | "wing"
  | "other";

export interface OOBUnit {
  name: string;
  strength?: string;
  note?: string;
}

export interface OOBFormation {
  name: string;
  kind?: FormationKind;
  strength?: string;
  commander?: string;
  note?: string;
  units?: OOBUnit[];
}

export interface OOBSide {
  /** Optional stable id/anchor; when blank the normalizer derives a slug from `label`. */
  id?: string;
  label: string;
  commander?: string;
  tone?: Tone;
  formations: OOBFormation[];
}

export interface OrderOfBattleProps {
  sides: OOBSide[];
  caption?: string;
}

const KINDS: ReadonlySet<string> = new Set([
  "army",
  "corps",
  "division",
  "brigade",
  "regiment",
  "fleet",
  "wing",
  "other",
]);

export interface NormUnit {
  name: string;
  strength?: string;
  note?: string;
}
export interface NormFormation {
  key: string;
  name: string;
  kind: FormationKind;
  strength?: string;
  commander?: string;
  note?: string;
  units: NormUnit[];
  hasUnits: boolean;
}
export interface NormSide {
  id: string;
  label: string;
  commander?: string;
  tone: Tone;
  formations: NormFormation[];
  /** count of formations (used in the side summary line). */
  formationCount: number;
}

export function normalizeTone(tone: Tone | undefined): Tone {
  return tone === "friendly" || tone === "enemy" || tone === "neutral" ? tone : "neutral";
}

export function normalizeKind(kind: FormationKind | undefined): FormationKind {
  return kind && KINDS.has(kind) ? kind : "other";
}

const clean = (s: string | undefined): string | undefined => {
  if (typeof s !== "string") return undefined;
  const t = s.trim();
  return t.length ? t : undefined;
};

/**
 * Normalize the whole order of battle. Trims strings, defaults tone → neutral
 * and kind → other, coerces a missing/blank side id to a slug of its label (+
 * index) so keys/anchors are stable, and flags whether each formation has
 * sub-units (drives the <details> vs plain-card render). Partial author input
 * never throws — empty formations arrays are kept as [].
 */
export function normalizeOrderOfBattle(sides: OOBSide[]): NormSide[] {
  return (sides ?? []).map((side, si) => {
    const label = (side.label ?? "").trim();
    const rawId = (side.id ?? "").trim();
    const id = rawId || slug(label) || `side-${si + 1}`;
    const formations = (side.formations ?? []).map((f, fi) => {
      const units = (f.units ?? []).map((u) => ({
        name: (u.name ?? "").trim(),
        strength: clean(u.strength),
        note: clean(u.note),
      }));
      return {
        key: `${id}-f${fi + 1}`,
        name: (f.name ?? "").trim(),
        kind: normalizeKind(f.kind),
        strength: clean(f.strength),
        commander: clean(f.commander),
        note: clean(f.note),
        units,
        hasUnits: units.length > 0,
      };
    });
    return {
      id,
      label,
      commander: clean(side.commander),
      tone: normalizeTone(side.tone),
      formations,
      formationCount: formations.length,
    };
  });
}

/** lowercase-hyphen slug for a stable id/anchor from a label. */
export function slug(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
