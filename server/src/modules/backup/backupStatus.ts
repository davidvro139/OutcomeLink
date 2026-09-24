import { env } from "../../config/env";
import { DEFAULT_BACKOFF_MS, registerJob, runJob } from "../../lib/jobRunner";
import { createNotification } from "../../lib/notifications";
import { prisma } from "../../lib/prisma";

const HOUR_MS = 60 * 60 * 1000;

export interface BackupStatusSummary {
  /** Whether a backup job can report in at all (BACKUP_CHECKIN_TOKEN is set). */
  configured: boolean;
  staleAfterHours: number;
  lastCheckin: {
    status: "SUCCESS" | "FAILED";
    note: string | null;
    sizeMb: number | null;
    createdAt: Date;
  } | null;
  lastSuccessAt: Date | null;
  /** Backups are reporting in but the latest run failed, or the last success is older than the stale threshold. */
  needsAttention: boolean;
  reason: string | null;
}

/**
 * "Never reported" is not flagged: with no check-in there's no way to know when
 * one was due, so the Settings page just says none has arrived yet. Once
 * backups have reported, a failed latest run or a success older than
 * BACKUP_STALE_HOURS needs attention.
 */
export async function getBackupStatus(): Promise<BackupStatusSummary> {
  const configured = !!env.BACKUP_CHECKIN_TOKEN;
  const [last, lastSuccess] = await Promise.all([
    prisma.backupCheckin.findFirst({ orderBy: { id: "desc" } }),
    prisma.backupCheckin.findFirst({ where: { status: "SUCCESS" }, orderBy: { id: "desc" } }),
  ]);

  let reason: string | null = null;
  if (configured && last) {
    if (last.status === "FAILED") {
      reason = `The most recent backup failed${last.note ? `: ${last.note}` : "."}`;
    } else if (
      lastSuccess &&
      Date.now() - lastSuccess.createdAt.getTime() > env.BACKUP_STALE_HOURS * HOUR_MS
    ) {
      reason = `No successful backup in the last ${env.BACKUP_STALE_HOURS} hours.`;
    }
  }

  return {
    configured,
    staleAfterHours: env.BACKUP_STALE_HOURS,
    lastCheckin: last && {
      status: last.status,
      note: last.note,
      sizeMb: last.sizeMb,
      createdAt: last.createdAt,
    },
    lastSuccessAt: lastSuccess?.createdAt ?? null,
    needsAttention: reason !== null,
    reason,
  };
}

/**
 * Daily: if backups are reporting in and need attention, tell every System
 * Administrator — but at most once a day each, so a backup that stays broken
 * doesn't bury them. Silent when nothing has needed attention.
 */
export async function alertIfBackupNeedsAttention(): Promise<{
  needsAttention: boolean;
  notified: number;
}> {
  const status = await getBackupStatus();
  if (!status.needsAttention) return { needsAttention: false, notified: 0 };

  const admins = await prisma.user.findMany({
    where: { role: "SYSTEM_ADMINISTRATOR", active: true },
    select: { id: true },
  });
  const recentSince = new Date(Date.now() - 20 * HOUR_MS);
  let notified = 0;
  for (const admin of admins) {
    const recent = await prisma.notification.findFirst({
      where: { userId: admin.id, type: "BACKUP_STALE", createdAt: { gt: recentSince } },
      select: { id: true },
    });
    if (recent) continue;
    await createNotification({
      userId: admin.id,
      type: "BACKUP_STALE",
      message: `Database backup needs attention. ${status.reason}`,
    });
    notified++;
  }
  return { needsAttention: true, notified };
}

registerJob({
  type: "BACKUP_CHECK",
  maxAttempts: 2,
  backoffMs: DEFAULT_BACKOFF_MS,
  handler: async () => ({ ...(await alertIfBackupNeedsAttention()) }),
  schedule: {
    cron: "0 8 * * *",
    trigger: async () => {
      await runJob("BACKUP_CHECK", { institutionId: null, trigger: "SCHEDULE" });
    },
  },
});
