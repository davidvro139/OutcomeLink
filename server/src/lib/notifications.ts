import type { NotificationType } from "@prisma/client";
import { publicUrl } from "./appUrls";
import { deliverEmail } from "./emailDelivery";
import { staffNotificationEmail } from "./emailTemplates";
import { isMailConfiguredFor, isMailPossible } from "./mailer";
import { prisma } from "./prisma";

export interface CreateNotificationInput {
  userId: number;
  type: NotificationType;
  message: string;
  referenceEntityType?: string;
  referenceEntityId?: number;
}

/** Notification types that are also emailed (to users who haven't opted out); everything else stays in-app only. */
const EMAILED_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  "BACKUP_STALE",
  "SCHEDULED_REPORT_READY",
  "MISSING_OUTCOMES_DIGEST",
  "FOLLOW_UP_OVERDUE",
]);

/**
 * Every notification creation site in the app ends up with the identical
 * shape below — this just names it once. Introduced alongside Advanced
 * Workflow Automation (Phase 3, docs/TODO.md), which adds several more
 * creation sites in the same neighborhood as the pre-existing ones
 * (missing-outcomes digest, Scheduled Reports).
 *
 * The in-app row is the source of truth. For the types in EMAILED_TYPES a
 * copy is also emailed in the background (docs/TODO.md's email delivery):
 * it's never awaited and never throws into the caller, so a slow or broken
 * mail server can't hold up, or fail, the job that raised the notification.
 */
export async function createNotification(input: CreateNotificationInput) {
  const notification = await prisma.notification.create({ data: input });
  if (EMAILED_TYPES.has(input.type) && isMailPossible()) {
    void emailNotification(input).catch((err) => console.error("Notification email failed", err));
  }
  return notification;
}

async function emailNotification(input: CreateNotificationInput): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { institutionId: true, name: true, email: true, active: true, emailNotifications: true },
  });
  if (!user || !user.active || !user.emailNotifications) return;
  if (!(await isMailConfiguredFor(user.institutionId))) return;
  await deliverEmail({
    institutionId: user.institutionId,
    purpose: "STAFF_NOTIFICATION",
    to: user.email,
    content: staffNotificationEmail({ name: user.name, message: input.message, url: publicUrl("/") }),
    relatedEntityType: "Notification",
  });
}
