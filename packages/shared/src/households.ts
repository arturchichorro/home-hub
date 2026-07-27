import * as z from "zod";

export const createHouseholdRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
  })
  .strict();

export type CreateHouseholdRequest = z.infer<
  typeof createHouseholdRequestSchema
>;
