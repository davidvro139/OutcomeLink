import { CPL_METRICS, type CplMetric } from "@outcomelink/shared";
import { Prisma } from "@prisma/client";
import { getProgramNotificationRecipients } from "../../lib/accessScope";
import { DEFAULT_BACKOFF_MS, registerJob, runJob } from "../../lib/jobRunner";
import { createNotification } from "../../lib/notifications";
import { prisma } from "../../lib/prisma";
import { ACTIVE_REPORTING_PERIOD_STATUSES } from "../../lib/reportingPeriods";
import { buildProgramDashboard } from "./programDashboard";

type AlertKind = "OFF_TRACK" | "AT_RISK_30" | "AT_RISK_7";

const LABELS: Record<CplMetric, string> = {
  COMPLETION: "Completion",
  PLACEMENT: "Placement",
  LICENSURE: "Licensure",
};

/**
 * Daily, after the nightly validation: tells a program's people when a metric
 * can no longer reach its benchmark (OFF_TRACK), or is still reachable but the
 * outcomes deadline is 30 or 7 days away (AT_RISK_30 / AT_RISK_7). Each
 * (period, program, metric, kind) is alerted once, recorded in AtRiskAlert —
 * this complements the notice validation already sends when a metric first
 * drops below its benchmark, rather than repeating it. Without a deadline set
 * only OFF_TRACK can fire.
 */
export async function alertAtRiskPrograms(
  institutionId: number,
): Promise<{ alerts: number; notifications: number }> {
  const periods = await prisma.reportingPeriod.findMany({
    where: { institutionId, status: { in: [...ACTIVE_REPORTING_PERIOD_STATUSES] } },
    select: { id: true },
  });

  let alerts = 0;
  let notifications = 0;
  for (const { id: periodId } of periods) {
    const dashboard = await buildProgramDashboard(institutionId, null, periodId);
    const daysLeft = dashboard.period?.daysUntilOutcomesDeadline ?? null;

    for (const program of dashboard.programs) {
      for (const metric of CPL_METRICS) {
        const m = program.metrics[metric];
        if (!m) continue;

        let kind: AlertKind | null = null;
        let message = "";
        if (m.status === "OFF_TRACK") {
          kind = "OFF_TRACK";
          message = `${program.name}: ${LABELS[metric]} is ${m.percentage}% against a ${m.benchmark}% benchmark and can no longer reach it in "${dashboard.period!.label}" — the best possible is ${m.maxPossiblePercentage}%.`;
        } else if (m.status === "AT_RISK" && daysLeft !== null && daysLeft >= 0 && daysLeft <= 30) {
          kind = daysLeft <= 7 ? "AT_RISK_7" : "AT_RISK_30";
          message = `${program.name}: ${LABELS[metric]} is ${m.percentage}% against ${m.benchmark}% — still ${m.needed} more success${m.needed === 1 ? "" : "es"} needed, with ${daysLeft} day${daysLeft === 1 ? "" : "s"} to the outcomes deadline for "${dashboard.period!.label}".`;
        }
        if (!kind) continue;

        try {
          await prisma.atRiskAlert.create({
            data: { reportingPeriodId: periodId, programId: program.programId, metric, kind },
          });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue; // already alerted
          throw err;
        }
        alerts++;
        for (const recipient of await getProgramNotificationRecipients(
          program.programId,
          institutionId,
        )) {
          await createNotification({
            userId: recipient.id,
            type: "PROGRAM_AT_RISK",
            message,
            referenceEntityType: "ReportingPeriod",
            referenceEntityId: periodId,
          });
          notifications++;
        }
      }
    }
  }
  return { alerts, notifications };
}

async function enqueueAtRiskChecks(): Promise<void> {
  const institutions = await prisma.institution.findMany({ select: { id: true } });
  for (const { id } of institutions)
    await runJob("AT_RISK_CHECK", { institutionId: id, trigger: "SCHEDULE" });
}

registerJob({
  type: "AT_RISK_CHECK",
  maxAttempts: 2,
  backoffMs: DEFAULT_BACKOFF_MS,
  handler: async ({ institutionId }) => ({ ...(await alertAtRiskPrograms(institutionId!)) }),
  schedule: { cron: "0 7 * * *", trigger: enqueueAtRiskChecks },
});
