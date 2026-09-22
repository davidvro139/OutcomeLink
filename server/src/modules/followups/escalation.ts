import { getProgramNotificationRecipients } from "../../lib/accessScope";
import { createNotification } from "../../lib/notifications";
import { prisma } from "../../lib/prisma";

const OVERDUE_THRESHOLD_DAYS = 14;
const RENOTIFY_THROTTLE_DAYS = 7;

/**
 * Advanced Workflow Automation (Phase 3, docs/TODO.md): notifies — never
 * reassigns, per explicit product decision — when an assigned student's
 * follow-up work goes more than OVERDUE_THRESHOLD_DAYS past its own
 * next-follow-up date. Throttled to at most once per RENOTIFY_THROTTLE_DAYS
 * per student by checking for an existing recent FOLLOW_UP_OVERDUE
 * notification (referenceEntityType "Student") rather than adding a new
 * schema field just to remember "last notified."
 */
export async function runFollowUpEscalation(): Promise<{ escalatedCount: number }> {
  const now = Date.now();
  const overdueBefore = new Date(now - OVERDUE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
  const throttleSince = new Date(now - RENOTIFY_THROTTLE_DAYS * 24 * 60 * 60 * 1000);

  const assignedStudents = await prisma.student.findMany({
    where: { assignedStaffUserId: { not: null } },
    include: {
      followUpAttempts: { orderBy: { attemptedAt: "desc" }, take: 1 },
      enrollments: {
        where: { actualCompletionDate: { not: null } },
        orderBy: { actualCompletionDate: "desc" },
        take: 1,
        select: { programId: true },
      },
    },
  });

  const overdue = assignedStudents.filter((student) => {
    const nextFollowUpDate = student.followUpAttempts[0]?.nextFollowUpDate;
    return nextFollowUpDate !== undefined && nextFollowUpDate !== null && nextFollowUpDate < overdueBefore;
  });
  if (overdue.length === 0) return { escalatedCount: 0 };

  const recentlyNotified = await prisma.notification.findMany({
    where: {
      type: "FOLLOW_UP_OVERDUE",
      referenceEntityType: "Student",
      referenceEntityId: { in: overdue.map((s) => s.id) },
      createdAt: { gte: throttleSince },
    },
    select: { referenceEntityId: true },
  });
  const recentlyNotifiedIds = new Set(recentlyNotified.map((n) => n.referenceEntityId));

  let escalatedCount = 0;
  for (const student of overdue) {
    if (recentlyNotifiedIds.has(student.id)) continue;

    const message = `${student.firstName} ${student.lastName}'s follow-up is more than ${OVERDUE_THRESHOLD_DAYS} days overdue.`;
    const recipientIds = new Set<number>([student.assignedStaffUserId!]);
    const programId = student.enrollments[0]?.programId;
    if (programId) {
      for (const admin of await getProgramNotificationRecipients(programId, student.institutionId)) {
        recipientIds.add(admin.id);
      }
    }

    await Promise.all(
      [...recipientIds].map((userId) =>
        createNotification({
          userId,
          type: "FOLLOW_UP_OVERDUE",
          message,
          referenceEntityType: "Student",
          referenceEntityId: student.id,
        }),
      ),
    );
    escalatedCount++;
  }

  return { escalatedCount };
}
