import * as z from "zod";
import { normalizeUsername } from "./normalization";

export const signupRequestSchema = z
  .object({
    username: z
      .string()
      .transform(normalizeUsername)
      .pipe(z.string().min(3).max(32)),
    email: z.string().trim().toLowerCase().pipe(z.email()),
    password: z.string().min(12).max(128),
    accessCode: z.string().trim().min(1),
  })
  .strict();

export type SignupRequest = z.infer<typeof signupRequestSchema>;
