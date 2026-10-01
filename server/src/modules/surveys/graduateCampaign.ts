import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { recordCommunicationEvent } from "../../lib/communicationEvents";
import { studentEmailTarget } from "../../lib/emailDelivery";
import { isMailConfiguredFor } from "../../lib/mailer";
import { runJob, registerJob, DEFAULT_BACKOFF_MS } from "../../lib/jobRunner";
import { prisma } from "../../lib/prisma";
import { getUnresolvedOutcomeStudentIds } from "../reports/reports";
import { sendGraduateSurveyEmail, emailOutcomeNote } from "./surveyEmail";

export const startGraduateCampaignSchema = z.object({
  reportingPeriodId: z.coerce.number().int().positive(),
  channel: z.string().trim().max(100).optional(),
});
type CampaignInput = z.infer<typeof startGraduateCampaignSchema>;

async function runCampaign(institutionId: number, { reportingPeriodId, channel }: CampaignInput) {
  const period = await prisma.reportingPeriod.findFirst({ where: { id: reportingPeriodId, institutionId } });
  if (!period) throw ApiError.notFound("Reporting period not found");
  const targetStudentIds = await getUnresolvedOutcomeStudentIds(institutionId, reportingPeriodId);
  const emailEnabled = (!channel || channel.toUpperCase() === "EMAIL") && await isMailConfiguredFor(institutionId);
  const result = { targetedCount: targetStudentIds.length, sentCount: 0, emailedCount: 0,
    failedCount: 0, resentCount: 0, skipped: [] as { studentId: number; reason: string }[] };

  for (const studentId of targetStudentIds) {
    const target = await studentEmailTarget(studentId);
    if ("skipped" in target && (emailEnabled || target.skipped === "Flagged do-not-contact")) {
      result.skipped.push({ studentId, reason: target.skipped });
      continue;
    }
    let survey = await prisma.graduateSurvey.findFirst({
      where: { studentId, response: null }, orderBy: { id: "desc" },
    });
    if (survey) {
      const delivery = emailEnabled ? await prisma.emailDelivery.findFirst({
        where: { institutionId, relatedEntityType: "GraduateSurvey", relatedEntityId: survey.id },
        orderBy: { id: "desc" },
      }) : null;
      if (delivery?.status !== "FAILED") {
        result.skipped.push({ studentId, reason: "Already has a pending graduate survey" });
        continue;
      }
      result.resentCount++;
    } else {
      survey = await prisma.graduateSurvey.create({ data: {
        studentId, sentAt: new Date(), channel: channel ?? (emailEnabled ? "EMAIL" : undefined), responseToken: randomUUID(),
      } });
      result.sentCount++;
    }
    const outcome = emailEnabled ? await sendGraduateSurveyEmail(institutionId, survey) : null;
    if (outcome?.status === "SENT") result.emailedCount++;
    if (outcome?.status === "FAILED") result.failedCount++;
    await recordCommunicationEvent({ studentId, eventType: "GRADUATE_SURVEY_SENT", sourceId: survey.id,
      occurredAt: new Date(), summaryText: `Graduate survey sent${survey.channel ? ` via ${survey.channel}` : ""} (quarterly outreach campaign)${outcome ? `; ${emailOutcomeNote(outcome)}` : ""}` });
  }
  return result;
}

registerJob({ type: "GRADUATE_CAMPAIGN", maxAttempts: 1, backoffMs: DEFAULT_BACKOFF_MS,
  handler: async (ctx) => {
    if (ctx.institutionId === null) throw new Error("Campaign requires an institution");
    return runCampaign(ctx.institutionId, startGraduateCampaignSchema.parse(ctx.params));
  },
});

export async function startCampaign(req: Request<Record<string, never>, unknown, CampaignInput>, res: Response) {
  const run = await runJob("GRADUATE_CAMPAIGN", { institutionId: req.user!.institutionId,
    trigger: "MANUAL", requestedBy: req.user!.sub, params: req.body, rethrow: true });
  sendData(res, run.result, 201);
}
