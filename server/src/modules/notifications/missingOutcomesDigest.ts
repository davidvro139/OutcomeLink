import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { createNotification } from "../../lib/notifications";
import { prisma } from "../../lib/prisma";
import { OPERATIONAL_ROLES } from "../../lib/roles";
import { getUnresolvedOutcomeStudentIds } from "../reports/reports";

export const generateDigestSchema = z.object({
  reportingPeriodId: z.coerce.number().int().positive(),
});
type GenerateDigestInput = z.infer<typeof generateDigestSchema>;

/**
 * "Missing-outcomes digest": one summary per active reporting period, sent
 * to every operational-role user at the institution. The morning job and
 * the Data Quality button both call this, so they notify the same people
 * about the same unresolved population as the Unknown Outcomes report and
 * the graduate outreach campaign. Per-program targeting is not attempted.
 * Zero unresolved students sends nothing.
 */
export async function sendMissingOutcomesDigest(
  institutionId: number,
  reportingPeriodId: number,
): Promise<{ recipientCount: number; unresolvedCount: number } | null> {
  const period = await prisma.reportingPeriod.findFirst({
    where: { id: reportingPeriodId, institutionId },
  });
  if (!period) return null;

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

export async function generateMissingOutcomesDigest(
  req: Request<Record<string, never>, unknown, GenerateDigestInput>,
  res: Response,
) {
  const result = await sendMissingOutcomesDigest(req.user!.institutionId, req.body.reportingPeriodId);
  if (!result) throw ApiError.notFound("Reporting period not found");
  sendData(res, result, result.unresolvedCount === 0 ? 200 : 201);
}
