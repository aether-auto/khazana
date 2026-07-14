import { z } from "zod";
import { LicenseTierSchema } from "./vocab.js";

/**
 * Provenance + Uncertainty — the shared sub-objects every World Data Spine datum
 * embeds. See docs/cofounder/specs/2026-07-07-world-data-spine-design.md §3.1.
 * A number with no `Provenance` attached is a schema violation, not a UI choice.
 */

// §3.1 — how a datum's uncertainty is expressed, discriminated on `kind`.
export const UncertaintySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("confidenceInterval"), low: z.number(), high: z.number(), level: z.number().min(0).max(1).default(0.95) }),
  z.object({ kind: z.literal("standardError"), se: z.number().nonnegative() }),
  z.object({ kind: z.literal("raterSpread"), min: z.number(), max: z.number(), raterCount: z.number().int().positive() }),
  z.object({ kind: z.literal("sampleSize"), n: z.number().int().positive() }),
  z.object({ kind: z.literal("none") }), // e.g. a single administrative headcount with no stated error
]);
export type Uncertainty = z.infer<typeof UncertaintySchema>;

export const ProvenanceSchema = z
  .object({
    sourceId: z.string(), // WorldSourceEntry.id, e.g. "world-bank-wdi", "allsides"
    sourceUrl: z.string().url(), // the specific page/API call this datum came from
    methodUrl: z.string().url(), // citation for the formula/methodology, not just the homepage
    licenseTier: LicenseTierSchema,
    /** True iff `value` is the provider's raw published number, redistributed as-is. */
    redistribution: z.boolean(),
    /** Did khazana compute this figure, or is it copied straight from a published table? */
    origin: z.enum(["computed", "referenced"]),
    retrievedAt: z.string().datetime(),
    uncertainty: UncertaintySchema,
  })
  .superRefine((p, ctx) => {
    // Decision #4, enforced at parse time: a derived-only source can NEVER claim raw
    // redistribution, and every datum it produces must be khazana-computed — we are
    // schema-forbidden from ever storing CPI/Polity5/Freedom House/FRED/ACLED/
    // AllSides/AdFontes/MBFC's raw table.
    if (p.licenseTier === "derived-only" && p.redistribution) {
      ctx.addIssue({ code: "custom", path: ["redistribution"], message: "derived-only sources must never redistribute raw values" });
    }
    if (p.licenseTier === "derived-only" && p.origin !== "computed") {
      ctx.addIssue({ code: "custom", path: ["origin"], message: "derived-only sources must carry a khazana-computed origin" });
    }
  });
export type Provenance = z.infer<typeof ProvenanceSchema>;
