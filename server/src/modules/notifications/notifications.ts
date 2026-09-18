import type { Request, Response } from "express";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";

/**
 * Notifications are per-user, not per-institution — deliberately no
 * institutionId scoping check here, since userId already pins every query to
 * the requesting user's own inbox.
 */
export async function list(req: Request, res: Response) {
  const userId = req.user!.sub;
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  sendData(res, { notifications, unreadCount });
}

export async function markRead(req: Request, res: Response) {
  const userId = req.user!.sub;
  const id = Number(req.params.id);
  const notification = await prisma.notification.findFirst({ where: { id, userId } });
  if (!notification) throw ApiError.notFound("Notification not found");

  const updated = await prisma.notification.update({
    where: { id },
    data: { readAt: notification.readAt ?? new Date() },
  });
  sendData(res, { notification: updated });
}

export async function markAllRead(req: Request, res: Response) {
  const userId = req.user!.sub;
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  sendData(res, { marked: true });
}
