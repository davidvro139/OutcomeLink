import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { recordCommunicationEvent } from "../../lib/communicationEvents";
import { studentEmailTarget, type EmailOutcome } from "../../lib/emailDelivery";
import { DEFAULT_BACKOFF_MS, registerJob, runJob } from "../../lib/jobRunner";
import { isMailConfiguredFor } from "../../lib/mailer";
import { prisma } from "../../lib/prisma";
import { getUnresolvedOutcomeStudentIds } from "../reports/reports";
import { emailOutcomeNote, noteworthy, sendGraduateSurveyEmail } from "./surveyEmail";

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

/**
 * Sends by email when email is configured and the campaign's channel is EMAIL
 * (or unspecified); otherwise it only creates the survey links, as before.
 * Do-not-contact students are always left out, and when emailing so are
 * students with no address on file — both are listed in `skipped` with the
 * reason rather than getting a survey nobody can receive.
 *
 * Re-running is safe and is how failed emails are retried: a student whose
 * pending survey's latest email FAILED gets that same survey re-sent (no
 * duplicate survey row), while one whose survey went out fine is skipped.
 */
async function runCampaign(institutionId: number, reportingPeriodId: number, channel: string | undefined) {
  const targetStudentIds = await getUnresolvedOutcomeStudentIds(institutionId, reportingPeriodId);
  const emailing = (await isMailConfiguredFor(institutionId)) && (!channel || channel.toUpperCase() === "EMAIL");
  const surveyChannel = channel ?? (emailing ? "EMAIL" : undefined);

  // Don't re-send to someone who already has a survey out that hasn't been
  // answered yet — that's a duplicate outreach, not a fresh one.
  const pendingSurveys = await prisma.graduateSurvey.findMany({
    where: { studentId: { in: targetStudentIds }, response: null },
    select: { id: true, studentId: true, responseToken: true },
  });
  const pendingByStudent = new Map(pendingSurveys.map((s) => [s.studentId, s]));

  const failedSurveyIds = new Set<number>();
  if (emailing && pendingSurveys.length > 0) {
    const deliveries = await prisma.emailDelivery.findMany({
      where: { relatedEntityType: "GraduateSurvey", relatedEntityId: { in: pendingSurveys.map((s) => s.id) } },
      orderBy: { id: "asc" },
      select: { relatedEntityId: true, status: true },
    });
    const latest = new Map<number, string>();
    for (const d of deliveries) latest.set(d.relatedEntityId!, d.status); // ascending, so the last write is the latest
    for (const [surveyId, status] of latest) if (status === "FAILED") failedSurveyIds.add(surveyId);
  }

  const skipped: { studentId: number; reason: string }[] = [];
  const resend: { id: number; studentId: number; responseToken: string }[] = [];
  const eligibleIds: number[] = [];
  for (const studentId of targetStudentIds) {
    const pending = pendingByStudent.get(studentId);
    if (pending) {
      if (failedSurveyIds.has(pending.id)) resend.push(pending);
      else skipped.push({ studentId, reason: "Already has a pending graduate survey" });
      continue;
    }
    const target = await studentEmailTarget(studentId);
    if ("skipped" in target && (target.skipped === "Flagged do-not-contact" || emailing)) {
      skipped.push({ studentId, reason: target.skipped });
      continue;
    }
    eligibleIds.push(studentId);
  }

  const createdSurveys = await Promise.all(
    eligibleIds.map((studentId) =>
      prisma.graduateSurvey.create({
        data: { studentId, sentAt: new Date(), channel: surveyChannel, responseToken: randomUUID() },
      }),
    ),
  );

  let emailedCount = 0;
  let failedCount = 0;
  const outcomes = new Map<number, EmailOutcome>();
  if (emailing) {
    for (const survey of [...createdSurveys, ...resend]) {
      const outcome = await sendGraduateSurveyEmail(institutionId, survey);
      outcomes.set(survey.id, outcome);
      if (outcome.status === "SENT") emailedCount++;
      else failedCount++;
    }
  }

  await Promise.all(
    createdSurveys.map((survey) => {
      const outcome = noteworthy(outcomes.get(survey.id) ?? null);
      return recordCommunicationEvent({
        studentId: survey.studentId,
        eventType: "GRADUATE_SURVEY_SENT",
        sourceId: survey.id,
        occurredAt: survey.sentAt,
        summaryText: `Graduate survey ${outcome ? "created" : "sent"}${survey.channel ? ` via ${survey.channel}` : ""}${outcome ? ` — ${emailOutcomeNote(outcome)}` : ""} (quarterly outreach campaign)`,
      });
    }),
  );

  return {
    targetedCount: targetStudentIds.length,
    sentCount: createdSurveys.length,
    emailedCount,
    failedCount,
    resentCount: resend.length,
    skipped,
  };
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
