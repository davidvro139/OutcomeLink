import { RETENTION_DEFAULTS, RETENTION_MAX_DAYS, RETENTION_MIN_DAYS } from "@outcomelink/shared";
import type { Request, Response } from "express";
import { z } from "zod";
import { sendData } from "../../lib/apiResponse";
import { deliverEmail } from "../../lib/emailDelivery";
import { staffNotificationEmail } from "../../lib/emailTemplates";
import { publicUrl } from "../../lib/appUrls";
import { runJob } from "../../lib/jobRunner";
import { resolveMailConfig, serverMailConfig } from "../../lib/mailConfig";
import { clearMailTransportCache } from "../../lib/mailer";
import { prisma } from "../../lib/prisma";
import { encryptSecret } from "../../lib/secrets";
import { getBackupStatus } from "../backup/backupStatus";
import { effectiveRetention } from "../retention/retention";

// ---------------------------------------------------------------- email

async function emailView(institutionId: number, role: string) {
  const [settings, resolved] = await Promise.all([
    prisma.institutionSettings.findUnique({ where: { institutionId } }),
    resolveMailConfig(institutionId),
  ]);
  return {
    source: resolved.source,
    serverDefaultAvailable: serverMailConfig() !== null,
    canEdit: role === "SYSTEM_ADMINISTRATOR",
    settings: {
      smtpHost: settings?.smtpHost ?? "",
      smtpPort: settings?.smtpPort ?? 587,
      smtpSecure: settings?.smtpSecure ?? false,
      smtpUser: settings?.smtpUser ?? "",
      mailFrom: settings?.mailFrom ?? "",
      // The password itself is never sent back — only whether one is stored.
      passwordSet: !!settings?.smtpPasswordEncrypted,
    },
  };
}

export async function getEmail(req: Request, res: Response) {
  sendData(res, await emailView(req.user!.institutionId, req.user!.role));
}

const HOSTNAME =
  /^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
/** Accepts `person@host` or `Display Name <person@host>`. */
const FROM_ADDRESS = /^(?:[^<>@\r\n]+<)?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?$/;

export const updateEmailSettingsSchema = z.object({
  smtpHost: z
    .string()
    .trim()
    .regex(HOSTNAME, "Enter a host name such as smtp.example.com (no https:// or path)"),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpSecure: z.boolean(),
  smtpUser: z.string().trim().max(191).optional().default(""),
  /** Omitted or blank keeps the stored password; set `clearPassword` to remove it. */
  smtpPassword: z.string().max(500).optional(),
  clearPassword: z.boolean().optional().default(false),
  mailFrom: z
    .string()
    .trim()
    .max(191)
    .regex(
      FROM_ADDRESS,
      "Enter an address such as no-reply@college.edu or College <no-reply@college.edu>",
    ),
});
type UpdateEmailSettingsInput = z.infer<typeof updateEmailSettingsSchema>;

export async function updateEmail(
  req: Request<Record<string, never>, unknown, UpdateEmailSettingsInput>,
  res: Response,
) {
  const institutionId = req.user!.institutionId;
  const body = req.body;
  const passwordUpdate = body.clearPassword
    ? { smtpPasswordEncrypted: null }
    : body.smtpPassword
      ? { smtpPasswordEncrypted: encryptSecret(body.smtpPassword) }
      : {};
  const data = {
    smtpHost: body.smtpHost,
    smtpPort: body.smtpPort,
    smtpSecure: body.smtpSecure,
    smtpUser: body.smtpUser || null,
    mailFrom: body.mailFrom,
    ...passwordUpdate,
    updatedBy: req.user!.sub,
  };
  await prisma.institutionSettings.upsert({
    where: { institutionId },
    create: { institutionId, ...data },
    update: data,
  });
  clearMailTransportCache();
  sendData(res, await emailView(institutionId, req.user!.role));
}

/** Back to the server's own settings (or none): clears this institution's SMTP fields, keeps everything else. */
export async function resetEmail(req: Request, res: Response) {
  const institutionId = req.user!.institutionId;
  await prisma.institutionSettings.updateMany({
    where: { institutionId },
    data: {
      smtpHost: null,
      smtpPort: null,
      smtpSecure: false,
      smtpUser: null,
      smtpPasswordEncrypted: null,
      mailFrom: null,
      updatedBy: req.user!.sub,
    },
  });
  clearMailTransportCache();
  sendData(res, await emailView(institutionId, req.user!.role));
}

/** Sends a test message to the signed-in administrator using the settings currently in effect, and reports exactly what the mail server said. */
export async function testEmail(req: Request, res: Response) {
  const institutionId = req.user!.institutionId;
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.user!.sub },
    select: { name: true, email: true },
  });
  const content = staffNotificationEmail({
    name: user.name,
    message:
      "This is a test message from OutcomeLink. If you can read it, your email settings work.",
    url: publicUrl("/settings"),
  });
  const outcome = await deliverEmail({
    institutionId,
    purpose: "TEST",
    to: user.email,
    content: { ...content, subject: "OutcomeLink test email" },
  });
  sendData(res, {
    status: outcome.status,
    ...(outcome.status === "SENT" ? {} : { reason: outcome.reason }),
    to: user.email,
  });
}

// ------------------------------------------------------------ retention

const days = z.coerce.number().int().min(RETENTION_MIN_DAYS).max(RETENTION_MAX_DAYS);

export const updateRetentionSchema = z.object({
  jobRunDays: days,
  emailLogDays: days,
  notificationDays: days,
  exportFileDays: days,
});
type UpdateRetentionInput = z.infer<typeof updateRetentionSchema>;

async function retentionView(institutionId: number) {
  const settings = await prisma.institutionSettings.findUnique({ where: { institutionId } });
  return {
    retention: effectiveRetention(settings),
    defaults: RETENTION_DEFAULTS,
    limits: { min: RETENTION_MIN_DAYS, max: RETENTION_MAX_DAYS },
  };
}

export async function getRetention(req: Request, res: Response) {
  sendData(res, await retentionView(req.user!.institutionId));
}

export async function updateRetention(
  req: Request<Record<string, never>, unknown, UpdateRetentionInput>,
  res: Response,
) {
  const institutionId = req.user!.institutionId;
  const data = {
    retentionJobRunDays: req.body.jobRunDays,
    retentionEmailLogDays: req.body.emailLogDays,
    retentionNotificationDays: req.body.notificationDays,
    retentionExportDays: req.body.exportFileDays,
    updatedBy: req.user!.sub,
  };
  await prisma.institutionSettings.upsert({
    where: { institutionId },
    create: { institutionId, ...data },
    update: data,
  });
  sendData(res, await retentionView(institutionId));
}

/** "Run cleanup now" — the same job the daily schedule runs, recorded in Job History. */
export async function runRetentionNow(req: Request, res: Response) {
  const run = await runJob("DATA_RETENTION", {
    institutionId: req.user!.institutionId,
    trigger: "MANUAL",
    requestedBy: req.user!.sub,
    rethrow: true,
  });
  sendData(res, { result: run.result }, 201);
}

// --------------------------------------------------------------- backup

export async function getBackup(_req: Request, res: Response) {
  sendData(res, await getBackupStatus());
}
