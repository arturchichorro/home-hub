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

export const loginRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    password: z.string().max(128),
  })
  .strict();

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const authUserSchema = z
  .object({
    id: z.uuid(),
    username: z.string().min(1),
    email: z.email(),
  })
  .strict();

export type AuthUser = z.infer<typeof authUserSchema>;

export const loginResponseSchema = z
  .object({
    user: authUserSchema,
    accessToken: z.string().min(1),
  })
  .strict();

export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const refreshResponseSchema = z
  .object({
    accessToken: z.string().min(1),
  })
  .strict();

export type RefreshResponse = z.infer<typeof refreshResponseSchema>;

export const meResponseSchema = z
  .object({
    user: authUserSchema,
  })
  .strict();

export type MeResponse = z.infer<typeof meResponseSchema>;
