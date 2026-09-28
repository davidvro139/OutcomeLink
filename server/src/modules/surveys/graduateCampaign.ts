import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { recordCommunicationEvent } from "../../lib/communicationEvents";
import { prisma } from "../../lib/prisma";
import { getUnresolvedOutcomeStudentIds } from "../reports/reports";

export const startGraduateCampaignSchema = z.object({
  reportingPeriodId: z.coerce.number().int().positive(),
  channel: z.string().trim().max(100).optional(),
});
type StartGraduateCampaignInput = z.infer<typeof startGraduateCampaignSchema>;

/**
 * "Quarterly graduate outreach campaign" (docs/TODO.md deferred items): a
 * batched send targeting every completer this period with no resolved
 * outcome yet, reusing reports.ts's exact SEEKING_OR_UNKNOWN/
 * MISSING_OUTCOME_RECORD definition so the campaign can never target a
 * different population than what the Unknown Outcomes report shows.
 *
 * "Quarterly" is manually triggered rather than actually time-scheduled —
 * this app has no job-scheduler infrastructure anywhere yet (every other
 * batch-style action, like Run Validation or Compute, is likewise an
 * explicit button click), so building one here would be a much larger,
 * separately-scoped decision. An admin runs this each quarter (or whenever)
 * the same way they'd click "Run Validation."
 */
export async function startCampaign(
  req: Request<Record<string, never>, unknown, StartGraduateCampaignInput>,
  res: Response,
) {
  const institutionId = req.user!.institutionId;
  const { reportingPeriodId, channel } = req.body;

  const period = await prisma.reportingPeriod.findFirst({
    where: { id: reportingPeriodId, institutionId },
  });
  if (!period) throw ApiError.notFound("Reporting period not found");

  const targetStudentIds = await getUnresolvedOutcomeStudentIds(institutionId, reportingPeriodId);

  // Don't re-send to someone who already has a survey out that hasn't been
  // answered yet — that's a duplicate outreach, not a fresh one.
  const pendingSurveys = await prisma.graduateSurvey.findMany({
    where: { studentId: { in: targetStudentIds }, response: null },
    select: { studentId: true },
  });
  const alreadyPending = new Set(pendingSurveys.map((s) => s.studentId));

  const eligibleIds = targetStudentIds.filter((id) => !alreadyPending.has(id));
  const skipped = targetStudentIds
    .filter((id) => alreadyPending.has(id))
    .map((studentId) => ({ studentId, reason: "Already has a pending graduate survey" }));

  const createdSurveys = await Promise.all(
    eligibleIds.map((studentId) =>
      prisma.graduateSurvey.create({
        data: { studentId, sentAt: new Date(), channel, responseToken: randomUUID() },
      }),
    ),
  );
  await Promise.all(
    createdSurveys.map((survey) =>
      recordCommunicationEvent({
        studentId: survey.studentId,
        eventType: "GRADUATE_SURVEY_SENT",
        sourceId: survey.id,
        occurredAt: survey.sentAt,
        summaryText: `Graduate survey sent${survey.channel ? ` via ${survey.channel}` : ""} (quarterly outreach campaign)`,
      }),
    ),
  );

  sendData(
    res,
    { targetedCount: targetStudentIds.length, sentCount: createdSurveys.length, skipped },
    201,
  );
}
