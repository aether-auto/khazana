import { z } from "zod";

export const EngagementEventSchema = z.object({
  itemId: z.string(),
  type: z.enum(["open", "read", "dwell"]),
  at: z.string().datetime(),
  dwellMs: z.number().optional(),
  deviceId: z.string().optional(),
});

export type EngagementEvent = z.infer<typeof EngagementEventSchema>;
