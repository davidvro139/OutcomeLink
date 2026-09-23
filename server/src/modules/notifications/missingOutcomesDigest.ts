import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { DEFAULT_BACKOFF_MS, registerJob, runJob } from "../../lib/jobRunner";
import { createNotification } from "../../lib/notifications";
import { prisma } from "../../lib/prisma";
import { OPERATIONAL_ROLES } from "../../lib/roles";
import { getUnresolvedOutcomeStudentIds } from "../reports/reports";

export const generateDigestSchema = z.object({
  reportingPeriodId: z.coerce.number().int().positive(),
});
type GenerateDigestInput = z.infer<typeof generateDigestSchema>;

/**
 * "Missing-outcomes digest" (docs/TODO.md deferred items): a pushed summary
 * to staff, vs. today's pull-based Validation tab / Unknown Outcomes report.
 * Reuses the same getUnresolvedOutcomeStudentIds() population as P8's report
 * and the graduate outreach campaign, so all three can never disagree about
 * who counts as "unresolved."
 *
 * Manually triggered rather than actually time-scheduled, same honesty as
 * the graduate campaign — no job-scheduler infrastructure exists anywhere in
 * this app yet. Sent to every operational-role user at the institution
 * (everyone who'd act on it); per-program targeting via UserProgramAccess is
 * a reasonable future refinement, not attempted here.
 */
export async function generateMissingOutcomesDigest(
  req: Request<Record<string, never>, unknown, GenerateDigestInput>,
  res: Response,
) {
  const institutionId = req.user!.institutionId;
  const { reportingPeriodId } = req.body;

  const period = await prisma.reportingPeriod.findFirst({
    where: { id: reportingPeriodId, institutionId },
  });
  if (!period) throw ApiError.notFound("Reporting period not found");

  // Tracked in job history like the other background jobs; a failed send can be retried from there.
  const run = await runJob("MISSING_OUTCOMES_DIGEST", {
    institutionId,
    params: { reportingPeriodId },
    trigger: "MANUAL",
    requestedBy: req.user!.sub,
    rethrow: true,
  });
  const result = run.result as { recipientCount: number; unresolvedCount: number };
  sendData(res, result, result.unresolvedCount === 0 ? 200 : 201);
}

async function runDigest(institutionId: number, reportingPeriodId: number) {
  const period = await prisma.reportingPeriod.findFirstOrThrow({
    where: { id: reportingPeriodId, institutionId },
  });
  const unresolvedIds = await getUnresolvedOutcomeStudentIds(institutionId, reportingPeriodId);
  if (unresolvedIds.length === 0) return { recipientCount: 0, unresolvedCount: 0 };

  const recipients = await prisma.user.findMany({
    where: { institutionId, role: { in: [...OPERATIONAL_ROLES] } },
    select: { id: true },
  });

  const message = `${unresolvedIds.length} student${unresolvedIds.length === 1 ? "" : "s"} in "${period.label}" ${unresolvedIds.length === 1 ? "has" : "have"} an unresolved outcome (seeking/unknown status or no outcome record on file).`;

  await Promise.all(
    recipients.map((recipient) =>
      createNotification({
        userId: recipient.id,
        type: "MISSING_OUTCOMES_DIGEST",
        message,
        referenceEntityType: "ReportingPeriod",
        referenceEntityId: reportingPeriodId,
      }),
    ),
  );

  return { recipientCount: recipients.length, unresolvedCount: unresolvedIds.length };
}

registerJob({
  type: "MISSING_OUTCOMES_DIGEST",
  maxAttempts: 1,
  backoffMs: DEFAULT_BACKOFF_MS,
  handler: ({ institutionId, params }) => runDigest(institutionId!, Number(params.reportingPeriodId)),
});
