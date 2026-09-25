import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";

/**
 * Authenticates a backup job with the server's BACKUP_CHECKIN_TOKEN. When the
 * variable isn't set the endpoint does not exist (404), so an instance that
 * never enabled it exposes nothing. Compared in constant time.
 */
export function requireBackupToken(req: Request, _res: Response, next: NextFunction) {
  const expected = env.BACKUP_CHECKIN_TOKEN;
  if (!expected)
    return next(new ApiError(404, "NOT_FOUND", `No route for ${req.method} ${req.originalUrl}`));

  const supplied = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1] ?? "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    return next(ApiError.unauthorized("Invalid backup token"));
  next();
}

export const backupCheckinSchema = z.object({
  status: z.enum(["SUCCESS", "FAILED"]),
  note: z.string().trim().max(2000).optional(),
  sizeMb: z.coerce.number().int().min(0).max(100_000_000).optional(),
});
type BackupCheckinInput = z.infer<typeof backupCheckinSchema>;

/** A backup job reports its result here after each run. */
export async function backupCheckin(
  req: Request<Record<string, never>, unknown, BackupCheckinInput>,
  res: Response,
) {
  const checkin = await prisma.backupCheckin.create({
    data: { status: req.body.status, note: req.body.note || null, sizeMb: req.body.sizeMb },
  });
  // Keep the table small: a year of check-ins is plenty of history.
  await prisma.backupCheckin.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } },
  });
  sendData(res, { checkin }, 201);
}
