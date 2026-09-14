import { ROLES } from "@outcomelink/shared";
import { z } from "zod";

export const registerSchema = z.object({
  institutionId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(ROLES),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;
