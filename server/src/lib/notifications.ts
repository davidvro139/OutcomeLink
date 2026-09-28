import type { NotificationType } from "@prisma/client";
import { prisma } from "./prisma";

export interface CreateNotificationInput {
  userId: number;
  type: NotificationType;
  message: string;
  referenceEntityType?: string;
  referenceEntityId?: number;
}

/**
 * Every notification creation site in the app ends up with the identical
 * shape below — this just names it once. Introduced alongside Advanced
 * Workflow Automation (Phase 3, docs/TODO.md), which adds several more
 * creation sites in the same neighborhood as the pre-existing ones
 * (missing-outcomes digest, Scheduled Reports).
 */
export function createNotification(input: CreateNotificationInput) {
  return prisma.notification.create({ data: input });
}
