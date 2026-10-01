import type { NotificationType } from "@prisma/client";
import { prisma } from "./prisma";
import { deliverEmail } from "./emailDelivery";
import { staffNotificationEmail } from "./emailTemplates";
import { publicUrl } from "./appUrls";

const EMAILED_TYPES: NotificationType[] = ["SCHEDULED_REPORT_READY", "REPORT_EXPORT_READY", "MISSING_OUTCOMES_DIGEST", "BACKUP_STALE", "PROGRAM_AT_RISK"];

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
export async function createNotification(input: CreateNotificationInput) {
  const notification = await prisma.notification.create({ data: input });
  if (EMAILED_TYPES.includes(input.type)) {
    void (async () => {
      const user = await prisma.user.findUnique({ where: { id: input.userId } });
      if (!user?.active || !user.emailNotifications) return;
      await deliverEmail({ institutionId: user.institutionId, purpose: "STAFF_NOTIFICATION", to: user.email,
        content: staffNotificationEmail({ name: user.name, message: input.message, url: publicUrl("/") }),
        relatedEntityType: "Notification", relatedEntityId: notification.id });
    })().catch((err) => console.error("Notification email failed", err));
  }
  return notification;
}
