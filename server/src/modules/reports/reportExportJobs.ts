import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/apiError";
import type { AccessTokenPayload } from "../../lib/jwt";
import { createNotification } from "../../lib/notifications";
import { sendData } from "../../lib/apiResponse";
import { reportExportStorage } from "../../lib/storage";
import { buildXlsxBuffer } from "../../lib/xlsx";
import { buildCustomReportSheet, type RunReportInput } from "./customReportBuilder";

const INSTITUTION_WIDE_ROLES = ["SYSTEM_ADMINISTRATOR", "INSTITUTIONAL_ADMINISTRATOR"];

function toAccessTokenPayload(user: { id: number; role: AccessTokenPayload["role"]; institutionId: number }): AccessTokenPayload {
  return { sub: user.id, role: user.role, institutionId: user.institutionId };
}

/**
 * Same reasoning as Scheduled Reports' findVisibleSubscription — a job's
 * generated file is a scope snapshot baked in at generation time with its
 * requester's own access, so sharing it institution-wide the way a
 * SavedReport's live-revalidated definition is shared wouldn't mean what
 * "shared" is supposed to mean here. Visible only to the requester or an
 * institution-wide administrator.
 */
async function findVisibleJob(req: Request, id: number) {
  const institutionId = req.user!.institutionId;
  const job = await prisma.reportExportJob.findFirst({
    where: {
      id,
      institutionId,
      ...(INSTITUTION_WIDE_ROLES.includes(req.user!.role) ? {} : { requestedBy: req.user!.sub }),
    },
  });
  if (!job) throw ApiError.notFound("Export job not found");
  return job;
}

/**
 * Report pagination and bounded exports (docs/TODO.md): generates one job's
 * report in the background, fire-and-forget from the request that queued
 * it — this app's first genuinely async, non-cron unit of work (Scheduled
 * Reports' "Run Now" is still a synchronous `await`, just outside the
 * subscription's *original* creating request). Re-derives the requester's
 * access scope fresh from their live User row, same as Scheduled Reports'
 * runSubscription re-derives a subscription creator's scope on every run —
 * so a job can never leak more than its requester could see right now, not
 * what they could see the moment they clicked. Always records a result and
 * notifies, success or failure, mirroring runSubscription's symmetry.
 */
export async function generateReportExport(jobId: number): Promise<void> {
  const job = await prisma.reportExportJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { requester: true },
  });
  const requesterPayload = toAccessTokenPayload(job.requester);

  try {
    const sheet = await buildCustomReportSheet(requesterPayload, job.definition as unknown as RunReportInput);
    const buffer = await buildXlsxBuffer([sheet]);
    const { fileReference } = await reportExportStorage.save({
      buffer,
      originalName: "report-export.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    await prisma.reportExportJob.update({
      where: { id: jobId },
      data: { status: "SUCCESS", fileReference, rowCount: sheet.rows.length, completedAt: new Date() },
    });
    await createNotification({
      userId: job.requestedBy,
      type: "REPORT_EXPORT_READY",
      message: `Your report export is ready — ${sheet.rows.length} row${sheet.rows.length === 1 ? "" : "s"}.`,
      referenceEntityType: "ReportExportJob",
      referenceEntityId: jobId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.reportExportJob.update({
      where: { id: jobId },
      data: { status: "FAILED", errorMessage: message, completedAt: new Date() },
    });
    await createNotification({
      userId: job.requestedBy,
      type: "REPORT_EXPORT_READY",
      message: `Your report export failed: ${message}`,
      referenceEntityType: "ReportExportJob",
      referenceEntityId: jobId,
    });
  }
}

export async function queueExport(
  req: Request<Record<string, never>, unknown, RunReportInput>,
  res: Response,
) {
  const job = await prisma.reportExportJob.create({
    data: {
      institutionId: req.user!.institutionId,
      requestedBy: req.user!.sub,
      definition: req.body,
    },
  });
  // Deliberately not awaited — the whole point is that a large export
  // doesn't block this request or risk a client/proxy timeout.
  void generateReportExport(job.id);
  sendData(res, { job }, 202);
}

export async function list(req: Request, res: Response) {
  const institutionId = req.user!.institutionId;
  const jobs = await prisma.reportExportJob.findMany({
    where: {
      institutionId,
      ...(INSTITUTION_WIDE_ROLES.includes(req.user!.role) ? {} : { requestedBy: req.user!.sub }),
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  sendData(res, { jobs });
}

export async function downloadJob(req: Request, res: Response) {
  const jobId = Number(req.params.id);
  const job = await findVisibleJob(req, jobId);
  if (!job.fileReference) throw ApiError.notFound("This export has no generated file (it may have failed)");

  const buffer = await reportExportStorage.load(job.fileReference);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="report-export-${job.id}.xlsx"`);
  res.send(buffer);
}
