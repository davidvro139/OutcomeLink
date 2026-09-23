import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { recordCommunicationEvent } from "../../lib/communicationEvents";
import { DEFAULT_BACKOFF_MS, registerJob, runJob } from "../../lib/jobRunner";
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

  // A tracked job run (docs/TODO.md's reusable scheduled-job infrastructure):
  // the send is recorded in job history, and a failure can be retried from
  // there — safe to repeat, since a student with a still-pending survey is
  // skipped.
  const run = await runJob("GRADUATE_CAMPAIGN", {
    institutionId,
    params: { reportingPeriodId, ...(channel ? { channel } : {}) },
    trigger: "MANUAL",
    requestedBy: req.user!.sub,
    rethrow: true,
  });
  sendData(res, run.result, 201);
}

async function runCampaign(institutionId: number, reportingPeriodId: number, channel: string | undefined) {
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

  return { targetedCount: targetStudentIds.length, sentCount: createdSurveys.length, skipped };
}

registerJob({
  type: "GRADUATE_CAMPAIGN",
  maxAttempts: 1,
  backoffMs: DEFAULT_BACKOFF_MS,
  handler: ({ institutionId, params }) =>
    runCampaign(
      institutionId!,
      Number(params.reportingPeriodId),
      typeof params.channel === "string" ? params.channel : undefined,
    ),
});
