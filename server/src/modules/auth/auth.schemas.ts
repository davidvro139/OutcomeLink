import { z } from "zod";

/**
 * Public registration bootstraps a BRAND NEW institution and its first
 * user only — it can never join an existing institution or pick a role
 * (see auth.service.ts's registerUser doc comment for why). Adding a user
 * to an institution that already has one requires an existing admin of
 * that institution, via POST /api/users.
 */
export const registerSchema = z.object({
  institutionName: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;
