import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";

/**
 * Unauthenticated by design — a newly invited (or password-resetting) user
 * has no working credentials yet. Access control is the unguessable
 * `passwordSetToken` in the URL, not a session — same reasoning as
 * publicSurveys.ts's `responseToken`.
 */
async function findValidToken(token: string) {
  const user = await prisma.user.findUnique({ where: { passwordSetToken: token } });
  if (!user || !user.passwordSetTokenExpiresAt || user.passwordSetTokenExpiresAt < new Date()) {
    throw ApiError.notFound("This link is invalid or has expired");
  }
  return user;
}

export async function getSetPasswordInfo(req: Request<{ token: string }>, res: Response) {
  const user = await findValidToken(req.params.token);
  sendData(res, { name: user.name, email: user.email });
}

export const completeSetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});
type CompleteSetPasswordInput = z.infer<typeof completeSetPasswordSchema>;

export async function completeSetPassword(
  req: Request<{ token: string }, unknown, CompleteSetPasswordInput>,
  res: Response,
) {
  const user = await findValidToken(req.params.token);
  const passwordHash = await hashPassword(req.body.password);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, passwordSetToken: null, passwordSetTokenExpiresAt: null },
  });
  sendData(res, { email: user.email });
}
