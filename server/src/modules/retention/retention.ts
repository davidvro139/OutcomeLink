import { RETENTION_DEFAULTS, type RetentionSettings } from "@outcomelink/shared";
import type { InstitutionSettings } from "@prisma/client";
import { DEFAULT_BACKOFF_MS, registerJob, runJob } from "../../lib/jobRunner";
import { prisma } from "../../lib/prisma";
import {
  reportExportStorage,
  scheduledReportStorage,
  type StorageAdapter,
} from "../../lib/storage";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The retention windows in effect: the institution's own where set, the defaults otherwise. */
export function effectiveRetention(
  settings: Pick<
    InstitutionSettings,
    | "retentionJobRunDays"
    | "retentionEmailLogDays"
    | "retentionNotificationDays"
    | "retentionExportDays"
  > | null,
): RetentionSettings {
  return {
    jobRunDays: settings?.retentionJobRunDays ?? RETENTION_DEFAULTS.jobRunDays,
    emailLogDays: settings?.retentionEmailLogDays ?? RETENTION_DEFAULTS.emailLogDays,
    notificationDays: settings?.retentionNotificationDays ?? RETENTION_DEFAULTS.notificationDays,
    exportFileDays: settings?.retentionExportDays ?? RETENTION_DEFAULTS.exportFileDays,
  };
}

export interface RetentionResult {
  jobRuns: number;
  scheduledReportRuns: number;
  reportExportJobs: number;
  emailDeliveries: number;
  notifications: number;
  filesRemoved: number;
}

const cutoff = (days: number) => new Date(Date.now() - days * DAY_MS);

/** Deletes a stored file, tolerating one that's already gone; a failure to delete is counted as not removed rather than aborting the cleanup. */
async function removeFile(storage: StorageAdapter, fileReference: string): Promise<boolean> {
  try {
    await storage.delete(fileReference);
    return true;
  } catch (err) {
    console.error(`Retention: could not delete ${fileReference}`, err);
    return false;
  }
}

/**
 * The daily cleanup for one institution (or, with `null`, for the system-wide
 * job runs that belong to no institution). Removes only operational records
 * past their window — job history, run records, the email log, notifications
 * the user already read, and the generated export files. It never touches the
 * audit log, evidence, or anything about students, enrollments or outcomes.
 * A generated file is removed after its (shorter) file window while its record
 * stays as history; the record goes at the job-history window.
 */
export async function runRetention(institutionId: number | null): Promise<RetentionResult> {
  const settings = institutionId
    ? await prisma.institutionSettings.findUnique({ where: { institutionId } })
    : null;
  const windows = effectiveRetention(settings);
  const result: RetentionResult = {
    jobRuns: 0,
    scheduledReportRuns: 0,
    reportExportJobs: 0,
    emailDeliveries: 0,
    notifications: 0,
    filesRemoved: 0,
  };

  // Job history (finished runs only — never one that is still running or waiting to retry).
  result.jobRuns = (
    await prisma.jobRun.deleteMany({
      where: {
        institutionId,
        status: { in: ["SUCCESS", "FAILED"] },
        finishedAt: { lt: cutoff(windows.jobRunDays) },
      },
    })
  ).count;

  if (institutionId === null) return result;

  // Generated files first: past the file window the file goes, the record stays.
  const fileCutoff = cutoff(windows.exportFileDays);
  const staleReportRuns = await prisma.scheduledReportRun.findMany({
    where: {
      fileReference: { not: null },
      runAt: { lt: fileCutoff },
      subscription: { institutionId },
    },
    select: { id: true, fileReference: true },
  });
  for (const run of staleReportRuns) {
    if (await removeFile(scheduledReportStorage, run.fileReference!)) {
      await prisma.scheduledReportRun.update({
        where: { id: run.id },
        data: { fileReference: null },
      });
      result.filesRemoved++;
    }
  }
  const staleExports = await prisma.reportExportJob.findMany({
    where: { institutionId, fileReference: { not: null }, createdAt: { lt: fileCutoff } },
    select: { id: true, fileReference: true },
  });
  for (const job of staleExports) {
    if (await removeFile(reportExportStorage, job.fileReference!)) {
      await prisma.reportExportJob.update({ where: { id: job.id }, data: { fileReference: null } });
      result.filesRemoved++;
    }
  }

  // Records past the job-history window (any file they still hold goes with them).
  const recordCutoff = cutoff(windows.jobRunDays);
  const oldReportRuns = await prisma.scheduledReportRun.findMany({
    where: { runAt: { lt: recordCutoff }, subscription: { institutionId } },
    select: { id: true, fileReference: true },
  });
  for (const run of oldReportRuns) {
    if (run.fileReference && (await removeFile(scheduledReportStorage, run.fileReference)))
      result.filesRemoved++;
  }
  result.scheduledReportRuns = (
    await prisma.scheduledReportRun.deleteMany({
      where: { id: { in: oldReportRuns.map((r) => r.id) } },
    })
  ).count;

  const oldExports = await prisma.reportExportJob.findMany({
    where: { institutionId, status: { not: "PENDING" }, createdAt: { lt: recordCutoff } },
    select: { id: true, fileReference: true },
  });
  for (const job of oldExports) {
    if (job.fileReference && (await removeFile(reportExportStorage, job.fileReference)))
      result.filesRemoved++;
  }
  result.reportExportJobs = (
    await prisma.reportExportJob.deleteMany({ where: { id: { in: oldExports.map((j) => j.id) } } })
  ).count;

  result.emailDeliveries = (
    await prisma.emailDelivery.deleteMany({
      where: { institutionId, createdAt: { lt: cutoff(windows.emailLogDays) } },
    })
  ).count;

  // Only notifications already read, counted from when they were read.
  result.notifications = (
    await prisma.notification.deleteMany({
      where: {
        readAt: { not: null, lt: cutoff(windows.notificationDays) },
        user: { institutionId },
      },
    })
  ).count;

  return result;
}

async function enqueueRetention(): Promise<void> {
  const institutions = await prisma.institution.findMany({ select: { id: true } });
  for (const { id } of institutions) {
    await runJob("DATA_RETENTION", { institutionId: id, trigger: "SCHEDULE" });
  }
  // Job runs that belong to no institution (system-wide jobs) are cleaned up on the defaults.
  await runJob("DATA_RETENTION", { institutionId: null, trigger: "SCHEDULE" });
}

registerJob({
  type: "DATA_RETENTION",
  maxAttempts: 2,
  backoffMs: DEFAULT_BACKOFF_MS,
  handler: async ({ institutionId }) => ({ ...(await runRetention(institutionId)) }),
  schedule: { cron: "30 3 * * *", trigger: enqueueRetention },
});
