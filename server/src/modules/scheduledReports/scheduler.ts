import cron from "node-cron";
import { runJob } from "../../lib/jobRunner";
import type { ScheduledReportFrequency } from "@outcomelink/shared";
import type { AccessTokenPayload } from "../../lib/jwt";
import { createNotification } from "../../lib/notifications";
import { prisma } from "../../lib/prisma";
import { scheduledReportStorage } from "../../lib/storage";
import { buildXlsxBuffer } from "../../lib/xlsx";
import { buildCustomReportSheet, type RunReportInput } from "../reports/customReportBuilder";
import { buildBuiltInReportSheet } from "./builtInReports";

/**
 * Calendar-accurate, not a day-count approximation (a "monthly" report
 * should land on roughly the same day each month regardless of month
 * length) — `Date`'s own `setMonth`/`setFullYear` already roll over
 * correctly (e.g. Jan 31 + 1 month becomes Mar 3, JS's documented overflow
 * behavior, not a bug to guard against here).
 */
export function computeNextRunAt(frequency: ScheduledReportFrequency, from: Date): Date {
  const next = new Date(from);
  switch (frequency) {
    case "DAILY":
      next.setDate(next.getDate() + 1);
      break;
    case "WEEKLY":
      next.setDate(next.getDate() + 7);
      break;
    case "MONTHLY":
      next.setMonth(next.getMonth() + 1);
      break;
    case "QUARTERLY":
      next.setMonth(next.getMonth() + 3);
      break;
    case "ANNUALLY":
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}

function toAccessTokenPayload(user: { id: number; role: AccessTokenPayload["role"]; institutionId: number }): AccessTokenPayload {
  return { sub: user.id, role: user.role, institutionId: user.institutionId };
}

/**
 * Runs one subscription now — shared by the cron tick below and the
 * "Run Now" HTTP action, so a manual run and an automatic one can never
 * behave differently. Always records a ScheduledReportRun and a
 * Notification, success or failure, so a broken subscription surfaces
 * instead of silently never delivering anything.
 */
export async function runSubscription(subscriptionId: number, notifyFailure = true) {
  const subscription = await prisma.scheduledReportSubscription.findUniqueOrThrow({
    where: { id: subscriptionId },
    include: { savedReport: true, creator: true },
  });
  const creatorPayload = toAccessTokenPayload(subscription.creator);

  let run;
  try {
    let report;
    if (subscription.reportSource === "SAVED_REPORT") {
      report = await buildCustomReportSheet(creatorPayload, subscription.savedReport!.definition as unknown as RunReportInput);
    } else {
      const { sheet } = await buildBuiltInReportSheet(subscription.institutionId, creatorPayload,
        subscription.builtInReportType!, subscription.reportingPeriodId);
      report = { sheets: [sheet], rowCount: sheet.rows.length };
    }
    const effectiveRowCount = report.rowCount;

    const buffer = await buildXlsxBuffer(report.sheets);
    const { fileReference } = await scheduledReportStorage.save({
      buffer,
      originalName: `${subscription.name}.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    run = await prisma.scheduledReportRun.create({
      data: { subscriptionId, status: "SUCCESS", fileReference, rowCount: effectiveRowCount },
    });

    await createNotification({
      userId: subscription.createdBy,
      type: "SCHEDULED_REPORT_READY",
      message: `Your scheduled report "${subscription.name}" ran — ${effectiveRowCount} row${effectiveRowCount === 1 ? "" : "s"}.`,
      referenceEntityType: "ScheduledReportRun",
      referenceEntityId: run.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    run = await prisma.scheduledReportRun.create({
      data: { subscriptionId, status: "FAILED", errorMessage: message },
    });
    if (notifyFailure) await createNotification({
      userId: subscription.createdBy,
      type: "SCHEDULED_REPORT_READY",
      message: `Your scheduled report "${subscription.name}" failed to run: ${message}`,
      referenceEntityType: "ScheduledReportRun",
      referenceEntityId: run.id,
    });
  }

  await prisma.scheduledReportSubscription.update({
    where: { id: subscriptionId },
    data: { lastRunAt: new Date(), nextRunAt: computeNextRunAt(subscription.frequency, new Date()) },
  });

  return run;
}

/**
 * Hourly tick is finer than the finest supported frequency (DAILY) — actual
 * cadence per subscription comes entirely from its own `nextRunAt`
 * (computeNextRunAt above), not from this interval. This is the first
 * time-based background task anywhere in this app (docs/TODO.md's Scheduled
 * Reports entry has the full "why this didn't exist until now" reasoning) —
 * skipped in tests (see server/src/index.ts) so a test run doesn't start a
 * real, unbounded interval no test ever tears down.
 */
export function startScheduler(): void {
  cron.schedule("0 * * * *", () => {
    void runDueSubscriptions();
  });
}

async function runDueSubscriptions(): Promise<void> {
  const due = await prisma.scheduledReportSubscription.findMany({
    where: { active: true, nextRunAt: { lte: new Date() }, creator: { active: true } },
    select: { id: true, institutionId: true },
  });
  for (const subscription of due) {
    try {
      await runJob("SCHEDULED_REPORT", { institutionId: subscription.institutionId, trigger: "SCHEDULE", params: { subscriptionId: subscription.id } });
    } catch (err) {
      // runSubscription already records a FAILED run for report-generation
      // errors; this is only a last-resort guard so one broken subscription
      // can't stop the rest of the batch from running this tick.
      console.error(`Scheduled report subscription ${subscription.id} failed`, err);
    }
  }
}
