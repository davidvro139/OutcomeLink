import type { Request, Response } from "express";
import { ROLES } from "@outcomelink/shared";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";

/**
 * Minimal institution staff directory — originally existed only to populate
 * "assign to" pickers (e.g. an Improvement Plan's responsible user). Full
 * user administration (invitations, deactivation, password reset,
 * program/campus assignment) is still its own, larger, not-yet-scheduled
 * feature — createUser() below is deliberately just enough to give admins a
 * real way to add staff now that public self-registration can no longer
 * join an existing institution (see auth.service.ts's registerUser).
 */
export async function list(req: Request, res: Response) {
  const users = await prisma.user.findMany({
    where: { institutionId: req.user!.institutionId, active: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  sendData(res, { users });
}

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(ROLES),
});
type CreateUserInput = z.infer<typeof createUserSchema>;

/** Always scoped to the caller's own institution — there is no institutionId in the input, so there's nothing to spoof. */
export async function create(
  req: Request<Record<string, never>, unknown, CreateUserInput>,
  res: Response,
) {
  const institutionId = req.user!.institutionId;
  const existing = await prisma.user.findUnique({ where: { email: req.body.email } });
  if (existing) throw ApiError.conflict("An account with this email already exists");

  const passwordHash = await hashPassword(req.body.password);
  const user = await prisma.user.create({
    data: {
      institutionId,
      name: req.body.name,
      email: req.body.email,
      passwordHash,
      role: req.body.role,
    },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  sendData(res, { user }, 201);
}
