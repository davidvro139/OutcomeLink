import request from "supertest";
import { createApp } from "../../app";
import { env } from "../../config/env";
import { resolveMailConfig } from "../../lib/mailConfig";
import { sendMail, setMailTransportForTests, type MailTransport, type OutgoingEmail } from "../../lib/mailer";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import { reportExportStorage } from "../../lib/storage";
import { alertIfBackupNeedsAttention } from "../backup/backupStatus";

const app = createApp();
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

describe("settings: email, data retention and backup status (integration)", () => {
  let institutionId: number;
  let otherInstitutionId: number;
  let sysAdminId: number;
  let instAdminId: number;
  let otherSysAdminId: number;
  let sysToken: string;
  let instToken: string;
  let careerToken: string;
  let otherSysToken: string;

  const sent: { message: OutgoingEmail; host?: string; from: string }[] = [];
  let failWith: string | null = null;
  const transport: MailTransport = {
    async sendMail(message, config) {
      if (failWith) throw new Error(failWith);
      sent.push({ message, host: config?.host, from: message.from });
    },
  };

  beforeEach(() => {
    sent.length = 0;
    failWith = null;
    setMailTransportForTests(transport);
  });
  afterEach(() => setMailTransportForTests(null));

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Settings Test College" } });
    institutionId = institution.id;
    otherInstitutionId = (await prisma.institution.create({ data: { name: "Other Settings College" } })).id;

    const passwordHash = await hashPassword("password123");
    const make = (inst: number, email: string, role: "SYSTEM_ADMINISTRATOR" | "INSTITUTIONAL_ADMINISTRATOR" | "CAREER_SERVICES_STAFF") =>
      prisma.user.create({ data: { institutionId: inst, name: email, email, passwordHash, role } });
    sysAdminId = (await make(institutionId, "sys@settings-test.edu", "SYSTEM_ADMINISTRATOR")).id;
    instAdminId = (await make(institutionId, "inst@settings-test.edu", "INSTITUTIONAL_ADMINISTRATOR")).id;
    await make(institutionId, "career@settings-test.edu", "CAREER_SERVICES_STAFF");
    otherSysAdminId = (await make(otherInstitutionId, "sys@other-settings-test.edu", "SYSTEM_ADMINISTRATOR")).id;

    const login = async (email: string) =>
      (await request(app).post("/api/auth/login").send({ email, password: "password123" })).body.data.accessToken as string;
    sysToken = await login("sys@settings-test.edu");
    instToken = await login("inst@settings-test.edu");
    careerToken = await login("career@settings-test.edu");
    otherSysToken = await login("sys@other-settings-test.edu");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  describe("email settings", () => {
    const valid = {
      smtpHost: "smtp.college.example",
      smtpPort: 465,
      smtpSecure: true,
      smtpUser: "mailer",
      smtpPassword: "s3cret-smtp-password",
      mailFrom: "Settings College <no-reply@college.example>",
    };

    it("starts with nothing configured, and shows the settings read-only to an institutional administrator", async () => {
      const res = await request(app).get("/api/settings/email").set(auth(instToken));
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ source: "none", canEdit: false });
      expect(res.body.data.settings).toMatchObject({ smtpHost: "", passwordSet: false });
    });

    it("is closed to staff who aren't administrators", async () => {
      expect((await request(app).get("/api/settings/email").set(auth(careerToken))).status).toBe(403);
    });

    it("only a System Administrator can change it", async () => {
      expect((await request(app).put("/api/settings/email").set(auth(instToken)).send(valid)).status).toBe(403);
      expect((await request(app).delete("/api/settings/email").set(auth(instToken))).status).toBe(403);
      expect((await request(app).post("/api/settings/email/test").set(auth(instToken))).status).toBe(403);
    });

    it("rejects an invalid host, port or from-address", async () => {
      const put = (patch: object) => request(app).put("/api/settings/email").set(auth(sysToken)).send({ ...valid, ...patch });
      expect((await put({ smtpHost: "https://smtp.example.com/path" })).status).toBe(400);
      expect((await put({ smtpHost: "" })).status).toBe(400);
      expect((await put({ smtpPort: 0 })).status).toBe(400);
      expect((await put({ smtpPort: 70000 })).status).toBe(400);
      expect((await put({ mailFrom: "not an address" })).status).toBe(400);
    });

    it("saves settings, encrypts the password at rest, and never returns it", async () => {
      const res = await request(app).put("/api/settings/email").set(auth(sysToken)).send(valid);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ source: "institution", canEdit: true });
      expect(res.body.data.settings).toMatchObject({ smtpHost: "smtp.college.example", smtpPort: 465, smtpSecure: true, smtpUser: "mailer", passwordSet: true });
      expect(JSON.stringify(res.body)).not.toContain("s3cret-smtp-password");

      const row = await prisma.institutionSettings.findUniqueOrThrow({ where: { institutionId } });
      expect(row.smtpPasswordEncrypted).toBeTruthy();
      expect(row.smtpPasswordEncrypted).not.toContain("s3cret-smtp-password");
      expect((await resolveMailConfig(institutionId)).config).toMatchObject({ host: "smtp.college.example", password: "s3cret-smtp-password" });
    });

    it("a blank password on save keeps the stored one, and clearPassword removes it", async () => {
      const kept = await request(app).put("/api/settings/email").set(auth(sysToken)).send({ ...valid, smtpPassword: "" });
      expect(kept.body.data.settings.passwordSet).toBe(true);
      expect((await resolveMailConfig(institutionId)).config?.password).toBe("s3cret-smtp-password");

      const cleared = await request(app).put("/api/settings/email").set(auth(sysToken)).send({ ...valid, smtpPassword: "", clearPassword: true });
      expect(cleared.body.data.settings.passwordSet).toBe(false);
      expect((await resolveMailConfig(institutionId)).config?.password).toBeUndefined();
      await request(app).put("/api/settings/email").set(auth(sysToken)).send(valid); // restore for the tests below
    });

    it("uses this institution's settings when it sends, and never another institution's", async () => {
      const invite = await request(app)
        .post("/api/users/invite")
        .set(auth(sysToken))
        .send({ name: "Invitee", email: "invitee@settings-test.edu", role: "INSTRUCTOR_STAFF" });
      expect(invite.body.data.emailStatus).toBe("SENT");
      expect(sent.at(-1)?.host).toBe("smtp.college.example");
      expect(sent.at(-1)?.from).toBe("Settings College <no-reply@college.example>");

      expect((await resolveMailConfig(otherInstitutionId)).source).toBe("none");
      expect((await request(app).get("/api/settings/email").set(auth(otherSysToken))).body.data.source).toBe("none");
    });

    it("falls back to the server's settings when the institution has none", async () => {
      const original = { host: env.SMTP_HOST, from: env.MAIL_FROM };
      try {
        env.SMTP_HOST = "smtp.server-default.example";
        env.MAIL_FROM = "server@default.example";
        const view = await request(app).get("/api/settings/email").set(auth(otherSysToken));
        expect(view.body.data).toMatchObject({ source: "server", serverDefaultAvailable: true });
        // An institution with its own settings still wins over the server's.
        expect((await resolveMailConfig(institutionId)).source).toBe("institution");
      } finally {
        env.SMTP_HOST = original.host;
        env.MAIL_FROM = original.from;
      }
    });

    it("sends a test email to the administrator and logs it; reports the mail server's error when it fails", async () => {
      const ok = await request(app).post("/api/settings/email/test").set(auth(sysToken));
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({ status: "SENT", to: "sys@settings-test.edu" });
      expect(sent.at(-1)?.message.to).toBe("sys@settings-test.edu");
      expect(await prisma.emailDelivery.count({ where: { institutionId, purpose: "TEST", status: "SENT" } })).toBe(1);

      failWith = "535 Authentication failed";
      const bad = await request(app).post("/api/settings/email/test").set(auth(sysToken));
      expect(bad.status).toBe(200);
      expect(bad.body.data).toMatchObject({ status: "FAILED", reason: "535 Authentication failed" });
      expect(await prisma.emailDelivery.count({ where: { institutionId, purpose: "TEST", status: "FAILED" } })).toBe(1);
    });

    it("a real SMTP failure surfaces as a rejected promise, never an uncaught exception", async () => {
      // Regression: the real nodemailer transport treats a second sendMail argument as a callback, so passing it the
      // config object crashed the whole process on any failed send. The fake transport used elsewhere can't catch that.
      setMailTransportForTests(null);
      await prisma.institutionSettings.create({
        data: { institutionId: otherInstitutionId, smtpHost: "127.0.0.1", smtpPort: 1, mailFrom: "x@example.com" },
      });
      try {
        await expect(
          sendMail({ to: "someone@example.com", subject: "s", text: "t", html: "<p>t</p>" }, otherInstitutionId),
        ).rejects.toThrow(/ECONNREFUSED|connect/i);
      } finally {
        await prisma.institutionSettings.delete({ where: { institutionId: otherInstitutionId } });
      }
    });

    it("reverting to server defaults removes the institution's settings", async () => {
      const res = await request(app).delete("/api/settings/email").set(auth(sysToken));
      expect(res.status).toBe(200);
      expect(res.body.data.source).toBe("none");
      expect(res.body.data.settings).toMatchObject({ smtpHost: "", passwordSet: false });
      const row = await prisma.institutionSettings.findUniqueOrThrow({ where: { institutionId } });
      expect(row.smtpPasswordEncrypted).toBeNull();
    });
  });

  describe("data retention", () => {
    it("shows the defaults, and validates the windows on save", async () => {
      const view = await request(app).get("/api/settings/retention").set(auth(instToken));
      expect(view.body.data.retention).toEqual({ jobRunDays: 180, emailLogDays: 180, notificationDays: 90, exportFileDays: 30 });

      const put = (patch: object) =>
        request(app).put("/api/settings/retention").set(auth(instToken)).send({ jobRunDays: 180, emailLogDays: 180, notificationDays: 90, exportFileDays: 30, ...patch });
      expect((await put({ exportFileDays: 6 })).status).toBe(400);
      expect((await put({ jobRunDays: 4000 })).status).toBe(400);
      expect((await put({ emailLogDays: 45 })).body.data.retention.emailLogDays).toBe(45);
      expect((await request(app).get("/api/settings/retention").set(auth(careerToken))).status).toBe(403);
      await put({ emailLogDays: 180 });
    });

    it("removes only records past their window, and only for this institution", async () => {
      const finished = (inst: number | null, ageDays: number, status: "SUCCESS" | "FAILED" | "RUNNING" = "SUCCESS") =>
        prisma.jobRun.create({
          data: { institutionId: inst, jobType: "SCHEDULED_REPORT", trigger: "SCHEDULE", status, attempt: 1, maxAttempts: 1, startedAt: daysAgo(ageDays), finishedAt: status === "RUNNING" ? null : daysAgo(ageDays) },
        });
      const oldRun = await finished(institutionId, 200);
      const recentRun = await finished(institutionId, 10);
      const stuckRun = await finished(institutionId, 200, "RUNNING");
      const otherOldRun = await finished(otherInstitutionId, 200);

      const email = (inst: number, ageDays: number) =>
        prisma.emailDelivery.create({ data: { institutionId: inst, purpose: "TEST", toAddress: "x@example.com", subject: "s", status: "SENT", createdAt: daysAgo(ageDays) } });
      const oldEmail = await email(institutionId, 200);
      const recentEmail = await email(institutionId, 5);
      const otherOldEmail = await email(otherInstitutionId, 200);

      const note = (userId: number, readDaysAgo: number | null, createdDaysAgo: number) =>
        prisma.notification.create({
          data: { userId, type: "VALIDATION_ERROR", message: "n", createdAt: daysAgo(createdDaysAgo), readAt: readDaysAgo === null ? null : daysAgo(readDaysAgo) },
        });
      const oldRead = await note(sysAdminId, 100, 120);
      const oldUnread = await note(sysAdminId, null, 120);
      const recentRead = await note(sysAdminId, 5, 10);
      const otherOldRead = await note(otherSysAdminId, 100, 120);

      const audit = await prisma.auditLogEntry.create({
        data: { entityType: "Student", entityId: 1, action: "UPDATE", userId: sysAdminId, occurredAt: daysAgo(900) },
      });

      const oldFile = await reportExportStorage.save({ buffer: Buffer.from("old"), originalName: "old.xlsx", mimeType: "application/octet-stream" });
      const recentFile = await reportExportStorage.save({ buffer: Buffer.from("new"), originalName: "new.xlsx", mimeType: "application/octet-stream" });
      const exportJob = (ageDays: number, fileReference: string) =>
        prisma.reportExportJob.create({
          data: { institutionId, requestedBy: sysAdminId, definition: {}, status: "SUCCESS", fileReference, createdAt: daysAgo(ageDays), completedAt: daysAgo(ageDays) },
        });
      const staleFileJob = await exportJob(45, oldFile.fileReference); // past the 30-day file window, inside the 180-day record window
      const freshJob = await exportJob(3, recentFile.fileReference);
      const ancientJob = await exportJob(400, (await reportExportStorage.save({ buffer: Buffer.from("x"), originalName: "a.xlsx", mimeType: "application/octet-stream" })).fileReference);

      const res = await request(app).post("/api/settings/retention/run").set(auth(instToken));
      expect(res.status).toBe(201);
      expect(res.body.data.result).toMatchObject({ jobRuns: 1, emailDeliveries: 1, notifications: 1, reportExportJobs: 1 });
      expect(res.body.data.result.filesRemoved).toBeGreaterThanOrEqual(2);

      const exists = async (model: "jobRun" | "emailDelivery" | "notification" | "reportExportJob", id: number) =>
        (await (prisma[model] as unknown as { count: (a: object) => Promise<number> }).count({ where: { id } })) === 1;
      expect(await exists("jobRun", oldRun.id)).toBe(false);
      expect(await exists("jobRun", recentRun.id)).toBe(true);
      expect(await exists("jobRun", stuckRun.id)).toBe(true); // never removes a run that hasn't finished
      expect(await exists("jobRun", otherOldRun.id)).toBe(true); // another institution's data is untouched
      expect(await exists("emailDelivery", oldEmail.id)).toBe(false);
      expect(await exists("emailDelivery", recentEmail.id)).toBe(true);
      expect(await exists("emailDelivery", otherOldEmail.id)).toBe(true);
      expect(await exists("notification", oldRead.id)).toBe(false);
      expect(await exists("notification", oldUnread.id)).toBe(true); // unread is kept however old
      expect(await exists("notification", recentRead.id)).toBe(true);
      expect(await exists("notification", otherOldRead.id)).toBe(true);
      expect(await prisma.auditLogEntry.count({ where: { id: audit.id } })).toBe(1); // the audit log is never pruned

      // Past its file window the file is removed but the record stays, with no file reference.
      expect((await prisma.reportExportJob.findUniqueOrThrow({ where: { id: staleFileJob.id } })).fileReference).toBeNull();
      await expect(reportExportStorage.load(oldFile.fileReference)).rejects.toThrow();
      expect((await prisma.reportExportJob.findUniqueOrThrow({ where: { id: freshJob.id } })).fileReference).toBe(recentFile.fileReference);
      expect((await reportExportStorage.load(recentFile.fileReference)).toString()).toBe("new");
      expect(await exists("reportExportJob", ancientJob.id)).toBe(false); // past the record window: gone entirely

      // It shows up in Job History as a manual run by the requester.
      const run = await prisma.jobRun.findFirstOrThrow({ where: { institutionId, jobType: "DATA_RETENTION" }, orderBy: { id: "desc" } });
      expect(run).toMatchObject({ trigger: "MANUAL", requestedBy: instAdminId, status: "SUCCESS" });
    });

    it("says an expired export's file was removed, rather than that it failed", async () => {
      const job = await prisma.reportExportJob.create({ data: { institutionId, requestedBy: sysAdminId, definition: {}, status: "SUCCESS", fileReference: null } });
      const res = await request(app).get(`/api/reports/custom/export-jobs/${job.id}/download`).set(auth(sysToken));
      expect(res.status).toBe(404);
      expect(res.body.error.message).toContain("expired");
    });
  });

  describe("backup status", () => {
    const setToken = (value: string | undefined) => {
      env.BACKUP_CHECKIN_TOKEN = value;
    };
    afterEach(async () => {
      setToken(undefined);
      await prisma.backupCheckin.deleteMany();
    });
    const checkin = (token: string | null, body: object = { status: "SUCCESS" }) => {
      const req = request(app).post("/api/system/backup-checkin");
      return (token ? req.set("Authorization", `Bearer ${token}`) : req).send(body);
    };

    it("is switched off (404) until a token is configured, then requires it", async () => {
      expect((await checkin("anything-at-all-1234")).status).toBe(404);
      setToken("a-backup-token-of-16+");
      expect((await checkin(null)).status).toBe(401);
      expect((await checkin("wrong-token-xxxxxxxx")).status).toBe(401);
      expect((await checkin("a-backup-token-of-16+", { status: "MAYBE" })).status).toBe(400);
      const ok = await checkin("a-backup-token-of-16+", { status: "SUCCESS", sizeMb: 512, note: "nightly dump" });
      expect(ok.status).toBe(201);
      expect(await prisma.backupCheckin.count()).toBe(1);
    });

    it("reports the last backup and flags a failed or stale one", async () => {
      const status = () => request(app).get("/api/settings/backup-status").set(auth(instToken));
      expect((await status()).body.data).toMatchObject({ configured: false, lastCheckin: null, needsAttention: false });

      setToken("a-backup-token-of-16+");
      expect((await status()).body.data).toMatchObject({ configured: true, lastCheckin: null, needsAttention: false }); // waiting for the first report

      await prisma.backupCheckin.create({ data: { status: "SUCCESS", sizeMb: 100 } });
      expect((await status()).body.data).toMatchObject({ needsAttention: false, lastCheckin: { status: "SUCCESS", sizeMb: 100 } });

      await prisma.backupCheckin.create({ data: { status: "FAILED", note: "disk full" } });
      const failed = (await status()).body.data;
      expect(failed.needsAttention).toBe(true);
      expect(failed.reason).toContain("disk full");

      await prisma.backupCheckin.deleteMany();
      await prisma.backupCheckin.create({ data: { status: "SUCCESS", createdAt: new Date(Date.now() - 50 * 60 * 60 * 1000) } });
      const stale = (await status()).body.data;
      expect(stale.needsAttention).toBe(true);
      expect(stale.reason).toContain("36 hours");

      expect((await request(app).get("/api/settings/backup-status").set(auth(careerToken))).status).toBe(403);
    });

    it("alerts System Administrators once a day, and is silent when backups are fine or not reporting", async () => {
      expect(await alertIfBackupNeedsAttention()).toEqual({ needsAttention: false, notified: 0 });

      setToken("a-backup-token-of-16+");
      await prisma.backupCheckin.create({ data: { status: "FAILED", note: "boom" } });
      const first = await alertIfBackupNeedsAttention();
      expect(first.needsAttention).toBe(true);
      expect(first.notified).toBeGreaterThanOrEqual(2); // both institutions' System Administrators

      const sysNotes = await prisma.notification.count({ where: { userId: sysAdminId, type: "BACKUP_STALE" } });
      expect(sysNotes).toBe(1);
      expect(await prisma.notification.count({ where: { userId: instAdminId, type: "BACKUP_STALE" } })).toBe(0);

      expect((await alertIfBackupNeedsAttention()).notified).toBe(0); // already told today
      expect(await prisma.notification.count({ where: { userId: sysAdminId, type: "BACKUP_STALE" } })).toBe(1);
    });
  });
});
