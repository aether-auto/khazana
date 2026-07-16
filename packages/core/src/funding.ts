import { z } from "zod";
import { CountryCodeSchema, PeriodSchema } from "./world-indicator.js";
import { ProvenanceSchema } from "./world-provenance.js";

export const FundingEntitySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  kind: z.enum([
    "corporation",
    "foundation",
    "government",
    "ngo",
    "individual",
    "multilateral-institution",
    "other",
  ]),
});
export type FundingEntity = z.infer<typeof FundingEntitySchema>;

export const FundingJurisdictionSchema = z.object({
  country: CountryCodeSchema,
  subdivision: z.string().min(1).nullable(),
});
export type FundingJurisdiction = z.infer<typeof FundingJurisdictionSchema>;

export const FundingAmountSchema = z.discriminatedUnion("disclosure", [
  z.object({
    disclosure: z.literal("disclosed"),
    value: z.number().nonnegative(),
    currency: z.string().regex(/^[A-Z]{3}$/),
  }),
  z.object({
    disclosure: z.literal("undisclosed"),
    value: z.null(),
    currency: z.null(),
  }),
]);
export type FundingAmount = z.infer<typeof FundingAmountSchema>;

export const FundingRelationshipTypeSchema = z.enum([
  "grant",
  "donation",
  "investment",
  "lobbying-retainer",
  "sponsorship",
  "other",
]);
export type FundingRelationshipType = z.infer<typeof FundingRelationshipTypeSchema>;

const periodGrain = (period: string): "year" | "quarter" | "month" | "day" => {
  if (/^\d{4}$/.test(period)) return "year";
  if (/^\d{4}-Q[1-4]$/.test(period)) return "quarter";
  if (/^\d{4}-\d{2}$/.test(period)) return "month";
  return "day";
};

const FundingPeriodRangeSchema = z
  .object({
    start: PeriodSchema,
    end: PeriodSchema,
  })
  .superRefine((period, ctx) => {
    if (periodGrain(period.start) === periodGrain(period.end) && period.start > period.end) {
      ctx.addIssue({
        code: "custom",
        path: ["end"],
        message: "period end precedes matching-grain start",
      });
    }
  });

export const FundingRelationshipSchema = z.object({
  id: z.string().min(1),
  funder: FundingEntitySchema,
  recipient: FundingEntitySchema,
  type: FundingRelationshipTypeSchema,
  amount: FundingAmountSchema,
  period: FundingPeriodRangeSchema,
  jurisdiction: FundingJurisdictionSchema,
  purpose: z.string().nullable(),
  tags: z.array(z.string()),
  provenance: ProvenanceSchema,
});
export type FundingRelationship = z.infer<typeof FundingRelationshipSchema>;
