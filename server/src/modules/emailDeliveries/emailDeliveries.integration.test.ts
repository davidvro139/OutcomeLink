import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../../app";
import { setMailTransportForTests, type OutgoingEmail } from "../../lib/mailer";
import { createNotification } from "../../lib/notifications";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import { runWithRequestContext } from "../../lib/requestContext";
import { computeReportingPeriod } from "../accreditation/calculators/cplCalculator";
import { runValidation } from "../accreditation/validators/validationEngine";

const app = createApp();

type Sent = OutgoingEmail & { from: string };

/**
 * Email delivery (docs/TODO.md): invitations, resets, surveys, the outreach
 * campaign and staff notifications actually go out through an SMTP transport
 * — faked here — with do-not-contact respected, every attempt recorded, and
 * the old copy-a-link fallbacks intact when email is off or a send fails.
 */
describe("email delivery (integration)", () => {
  let institutionId: number;
  let campusId: number;
  let programId: number;
  let reportingPeriodId: number;
  let adminId: number;
  let adminToken: string;
  let careerToken: string;
  let otherAdminToken: string;

  const sent: Sent[] = [];
  let failNext = 0;
  let failMatching: string | null = null;

  beforeEach(() => {
    sent.length = 0;
    failNext = 0;
    failMatching = null;
    setMailTransportForTests({
      async sendMail(message) {
        if (failNext > 0) {
          failNext--;
          throw new Error("SMTP connection refused");
        }
        if (failMatching && message.to === failMatching) throw new Error("Mailbox unavailable");
        sent.push(message);
      },
    });
  });

  afterEach(() => setMailTransportForTests(null));

  async function makeStudent(label: string, opts: { email?: string | null; doNotContact?: boolean } = {}) {
    const student = await prisma.student.create({
      data: {
        institutionId,
        internalStudentId: `EMAIL-${label}-${randomUUID().slice(0, 6)}`,
        firstName: label,
        lastName: "Student",
        email: opts.email === undefined ? `${label.toLowerCase()}@student.example.edu` : opts.email,
      },
    });
    if (opts.doNotContact) {
      await prisma.studentCommunicationPreference.create({ data: { studentId: student.id, doNotContact: true } });
    }
    return student;
  }

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Email Test College" } });
    institutionId = institution.id;
    const other = await prisma.institution.create({ data: { name: "Other Email Institution" } });

    const passwordHash = await hashPassword("password123");
    adminId = (
      await prisma.user.create({
        data: { institutionId, name: "Ada Admin", email: "admin@email-test.edu", passwordHash, role: "INSTITUTIONAL_ADMINISTRATOR" },
      })
    ).id;
    await prisma.user.create({
      data: { institutionId, name: "Career", email: "career@email-test.edu", passwordHash, role: "CAREER_SERVICES_STAFF" },
    });
    await prisma.user.create({
      data: { institutionId: other.id, name: "Other", email: "admin@other-email-test.edu", passwordHash, role: "INSTITUTIONAL_ADMINISTRATOR" },
    });
    const login = async (email: string) =>
      (await request(app).post("/api/auth/login").send({ email, password: "password123" })).body.data.accessToken as string;
    adminToken = await login("admin@email-test.edu");
    careerToken = await login("career@email-test.edu");
    otherAdminToken = await login("admin@other-email-test.edu");

    campusId = (await prisma.campus.create({ data: { institutionId, name: "Main" } })).id;
    programId = (
      await prisma.program.create({
        data: { institutionId, campusId, name: "Welding", code: "EM-WELD", credentialType: "Diploma" },
      })
    ).id;
    const framework = await prisma.accreditationFramework.create({ data: { name: "COE-EMAIL-TEST" } });
    const ruleSet = await prisma.ruleSet.create({
      data: {
        frameworkId: framework.id,
        versionLabel: "COE-2026-EMAIL-TEST",
        effectiveStartDate: new Date("2025-01-01"),
        ruleDefinition: { benchmarks: { completion: 60, placement: 70, licensure: 70 } },
      },
    });
    reportingPeriodId = (
      await prisma.reportingPeriod.create({
        data: { institutionId, ruleSetId: ruleSet.id, label: "EMAIL-PERIOD", startDate: new Date("2025-07-01"), endDate: new Date("2026-06-30") },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("invitations and password resets", () => {
    it("emails the set-password link and does not hand the token to the admin", async () => {
      const res = await request(app)
        .post("/api/users/invite")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "New Person", email: "new.person@email-test.edu", role: "INSTRUCTOR_STAFF" });
      expect(res.status).toBe(201);
      expect(res.body.data.emailStatus).toBe("SENT");
      expect(res.body.data.token).toBeUndefined();

      expect(sent).toHaveLength(1);
      expect(sent[0]!.to).toBe("new.person@email-test.edu");
      const stored = await prisma.user.findUniqueOrThrow({ where: { email: "new.person@email-test.edu" } });
      expect(sent[0]!.text).toContain(`/set-password/${stored.passwordSetToken}`);
      expect(sent[0]!.html).toContain(`/set-password/${stored.passwordSetToken}`);

      const log = await prisma.emailDelivery.findFirstOrThrow({ where: { institutionId, purpose: "INVITATION" } });
      expect(log).toMatchObject({ toAddress: "new.person@email-test.edu", status: "SENT" });
      // The body (which carries a live credential) is not stored.
      expect(JSON.stringify(log)).not.toContain(stored.passwordSetToken!);
    });

    it("falls back to returning the token, and logs a FAILED delivery, when the send fails", async () => {
      failNext = 1;
      const res = await request(app)
        .post("/api/users/invite")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Unlucky", email: "unlucky@email-test.edu", role: "INSTRUCTOR_STAFF" });
      expect(res.status).toBe(201);
      expect(res.body.data.emailStatus).toBe("FAILED");
      expect(res.body.data.emailReason).toContain("SMTP connection refused");
      expect(res.body.data.token).toBeTruthy();

      const log = await prisma.emailDelivery.findFirstOrThrow({ where: { toAddress: "unlucky@email-test.edu" } });
      expect(log.status).toBe("FAILED");
      expect(log.errorMessage).toContain("SMTP connection refused");
    });

    it("password reset emails a fresh link too", async () => {
      const user = await prisma.user.findUniqueOrThrow({ where: { email: "career@email-test.edu" } });
      const res = await request(app)
        .post(`/api/users/${user.id}/reset-password`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.emailStatus).toBe("SENT");
      expect(res.body.data.token).toBeUndefined();
      const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(sent[0]!.text).toContain(`/set-password/${refreshed.passwordSetToken}`);
    });

    it("with email not configured, behaves as before: token returned, nothing logged", async () => {
      setMailTransportForTests(null);
      const before = await prisma.emailDelivery.count({ where: { institutionId } });
      const res = await request(app)
        .post("/api/users/invite")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Manual", email: "manual@email-test.edu", role: "INSTRUCTOR_STAFF" });
      expect(res.body.data.emailStatus).toBe("SKIPPED");
      expect(res.body.data.token).toBeTruthy();
      expect(await prisma.emailDelivery.count({ where: { institutionId } })).toBe(before);
    });
  });

  describe("graduate surveys", () => {
    it("emails the survey link when the channel is EMAIL", async () => {
      const student = await makeStudent("Grace");
      const res = await request(app)
        .post(`/api/students/${student.id}/graduate-surveys`)
        .set("Authorization", `Bearer ${careerToken}`)
        .send({ channel: "EMAIL" });
      expect(res.status).toBe(201);
      expect(res.body.data.emailStatus).toBe("SENT");
      expect(sent).toHaveLength(1);
      expect(sent[0]!.to).toBe("grace@student.example.edu");
      expect(sent[0]!.text).toContain(`/survey/graduate/${res.body.data.survey.responseToken}`);
      expect(sent[0]!.subject).toContain("Email Test College");
    });

    it("does not email other channels", async () => {
      const student = await makeStudent("Sam");
      const res = await request(app)
        .post(`/api/students/${student.id}/graduate-surveys`)
        .set("Authorization", `Bearer ${careerToken}`)
        .send({ channel: "SMS" });
      expect(res.status).toBe(201);
      expect(res.body.data.emailStatus).toBeUndefined();
      expect(sent).toHaveLength(0);
    });

    it("refuses to email a do-not-contact student", async () => {
      const student = await makeStudent("Nora", { doNotContact: true });
      const res = await request(app)
        .post(`/api/students/${student.id}/graduate-surveys`)
        .set("Authorization", `Bearer ${careerToken}`)
        .send({ channel: "EMAIL" });
      expect(res.status).toBe(409);
      expect(sent).toHaveLength(0);
      expect(await prisma.graduateSurvey.count({ where: { studentId: student.id } })).toBe(0);
    });

    it("still creates the link when the student has no email, reporting why it wasn't sent", async () => {
      const student = await makeStudent("Ned", { email: null });
      const res = await request(app)
        .post(`/api/students/${student.id}/graduate-surveys`)
        .set("Authorization", `Bearer ${careerToken}`)
        .send({ channel: "EMAIL" });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ emailStatus: "SKIPPED", emailReason: "No email on file" });
      expect(res.body.data.survey.responseToken).toBeTruthy();
      expect(sent).toHaveLength(0);
    });
  });

  describe("employer surveys", () => {
    async function employerWithContacts(contacts: { name: string; email: string | null; primary?: boolean; verification?: boolean }[]) {
      const employer = await prisma.employer.create({ data: { institutionId, name: `Employer ${randomUUID().slice(0, 5)}`, active: true } });
      for (const c of contacts) {
        await prisma.employerContact.create({
          data: { employerId: employer.id, name: c.name, email: c.email, isPrimaryContact: !!c.primary, isVerificationContact: !!c.verification },
        });
      }
      const student = await makeStudent("Wes");
      await prisma.employmentRecord.create({
        data: { studentId: student.id, employerId: employer.id, jobTitle: "Welder", startDate: new Date("2026-01-01"), fullTime: true, relatedToTraining: true, salaryOrWage: 40000, employmentStatus: "EMPLOYED" },
      });
      return { employer, student };
    }

    async function sendEmployerSurvey(studentId: number, body: object) {
      return request(app)
        .post(`/api/students/${studentId}/employer-surveys`)
        .set("Authorization", `Bearer ${careerToken}`)
        .send(body);
    }

    it("prefers a verification contact, then the primary contact, then anyone with an address", async () => {
      const a = await employerWithContacts([
        { name: "Front Desk", email: "front@acme.example" },
        { name: "Boss", email: "boss@acme.example", primary: true },
        { name: "Verifier", email: "verify@acme.example", verification: true },
      ]);
      expect((await sendEmployerSurvey(a.student.id, { employerId: a.employer.id })).body.data.emailStatus).toBe("SENT");
      expect(sent.at(-1)!.to).toBe("verify@acme.example");
      expect(sent.at(-1)!.subject).toContain("Wes Student");

      const b = await employerWithContacts([
        { name: "Front Desk", email: "front2@acme.example" },
        { name: "Boss", email: "boss2@acme.example", primary: true },
      ]);
      await sendEmployerSurvey(b.student.id, { employerId: b.employer.id });
      expect(sent.at(-1)!.to).toBe("boss2@acme.example");

      const c = await employerWithContacts([{ name: "Only", email: "only@acme.example" }]);
      await sendEmployerSurvey(c.student.id, { employerId: c.employer.id });
      expect(sent.at(-1)!.to).toBe("only@acme.example");
    });

    it("honors an explicit contact, and skips with a reason when there is no address", async () => {
      const a = await employerWithContacts([
        { name: "Verifier", email: "verify3@acme.example", verification: true },
        { name: "Chosen", email: "chosen@acme.example" },
      ]);
      const chosen = await prisma.employerContact.findFirstOrThrow({ where: { employerId: a.employer.id, name: "Chosen" } });
      await sendEmployerSurvey(a.student.id, { employerId: a.employer.id, employerContactId: chosen.id });
      expect(sent.at(-1)!.to).toBe("chosen@acme.example");

      const none = await employerWithContacts([{ name: "No Email", email: null }]);
      const res = await sendEmployerSurvey(none.student.id, { employerId: none.employer.id });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ emailStatus: "SKIPPED", emailReason: "No employer contact has an email address" });
    });

    it("does not email when sendEmail is false", async () => {
      const a = await employerWithContacts([{ name: "Boss", email: "boss4@acme.example", primary: true }]);
      const before = sent.length;
      const res = await sendEmployerSurvey(a.student.id, { employerId: a.employer.id, sendEmail: false });
      expect(res.status).toBe(201);
      expect(sent.length).toBe(before);
    });
  });

  describe("graduate outreach campaign", () => {
    const ids: Record<string, number> = {};

    beforeAll(async () => {
      async function completer(label: string, opts: { email?: string | null; doNotContact?: boolean } = {}) {
        const student = await makeStudent(label, opts);
        const enrollment = await prisma.studentEnrollment.create({
          data: {
            studentId: student.id,
            programId,
            campusId,
            startDate: new Date("2025-01-01"),
            actualCompletionDate: new Date("2026-01-01"),
            enrollmentStatus: "GRADUATE_COMPLETER",
          },
        });
        await prisma.studentOutcomeRecord.create({
          data: { studentEnrollmentId: enrollment.id, reportingPeriodId, licensureRequired: false, employmentStatus: "UNKNOWN" },
        });
        ids[label] = student.id;
      }
      await completer("Cam");
      await completer("Dee");
      await completer("Dnc", { doNotContact: true });
      await completer("Blank", { email: null });
      await runWithRequestContext({ userId: adminId }, () => computeReportingPeriod(reportingPeriodId));
      await runValidation(reportingPeriodId);
    });

    function runCampaign(body: object = {}) {
      return request(app)
        .post("/api/surveys/graduate-campaign")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ reportingPeriodId, ...body });
    }

    it("emails eligible students, and skips do-not-contact and no-address students with reasons", async () => {
      failMatching = "dee@student.example.edu";
      const res = await runCampaign();
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ targetedCount: 4, sentCount: 2, emailedCount: 1, failedCount: 1, resentCount: 0 });
      expect(res.body.data.skipped).toEqual(
        expect.arrayContaining([
          { studentId: ids["Dnc"]!, reason: "Flagged do-not-contact" },
          { studentId: ids["Blank"]!, reason: "No email on file" },
        ]),
      );
      expect(sent.map((m) => m.to)).toEqual(["cam@student.example.edu"]);
      // No survey was created for the students who can't be contacted.
      expect(await prisma.graduateSurvey.count({ where: { studentId: { in: [ids["Dnc"]!, ids["Blank"]!] } } })).toBe(0);

      const survey = await prisma.graduateSurvey.findFirstOrThrow({ where: { studentId: ids.Dee } });
      const failed = await prisma.emailDelivery.findFirstOrThrow({ where: { relatedEntityType: "GraduateSurvey", relatedEntityId: survey.id } });
      expect(failed.status).toBe("FAILED");
    });

    it("re-running re-sends only the failed email, on the same survey, and skips the rest", async () => {
      const dee = await prisma.graduateSurvey.findFirstOrThrow({ where: { studentId: ids.Dee } });
      const res = await runCampaign();
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ sentCount: 0, emailedCount: 1, failedCount: 0, resentCount: 1 });
      expect(sent.map((m) => m.to)).toEqual(["dee@student.example.edu"]);
      expect(sent[0]!.text).toContain(`/survey/graduate/${dee.responseToken}`);
      expect(await prisma.graduateSurvey.count({ where: { studentId: ids.Dee } })).toBe(1);

      // Now everyone reachable has a delivered survey: a third run sends nothing.
      sent.length = 0;
      const third = await runCampaign();
      expect(third.body.data).toMatchObject({ sentCount: 0, emailedCount: 0, resentCount: 0 });
      expect(sent).toHaveLength(0);
    });
  });

  describe("staff notifications", () => {
    async function notify(userId: number, type: "SCHEDULED_REPORT_READY" | "VALIDATION_ERROR") {
      await createNotification({ userId, type, message: "Something happened" });
      // The email is sent in the background; give it a tick to land.
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    it("emails a copy of the emailed notification types, and only those", async () => {
      await notify(adminId, "SCHEDULED_REPORT_READY");
      expect(sent).toHaveLength(1);
      expect(sent[0]!.to).toBe("admin@email-test.edu");
      expect(sent[0]!.text).toContain("Something happened");

      await notify(adminId, "VALIDATION_ERROR");
      expect(sent).toHaveLength(1);
    });

    it("respects the user's opt-out, and never throws into the caller when the send fails", async () => {
      const opt = await request(app)
        .patch("/api/auth/me/preferences")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ emailNotifications: false });
      expect(opt.body.data.preferences.emailNotifications).toBe(false);
      await notify(adminId, "SCHEDULED_REPORT_READY");
      expect(sent).toHaveLength(0);

      await request(app).patch("/api/auth/me/preferences").set("Authorization", `Bearer ${adminToken}`).send({ emailNotifications: true });
      failNext = 1;
      await expect(createNotification({ userId: adminId, type: "SCHEDULED_REPORT_READY", message: "x" })).resolves.toBeDefined();
      await new Promise((resolve) => setTimeout(resolve, 250));
      const failedLog = await prisma.emailDelivery.findFirst({ where: { purpose: "STAFF_NOTIFICATION", status: "FAILED" } });
      expect(failedLog).not.toBeNull();
    });
  });

  describe("email log API", () => {
    it("lists only the caller's institution, filterable, admin-only", async () => {
      const list = await request(app).get("/api/email-deliveries?pageSize=100").set("Authorization", `Bearer ${adminToken}`);
      expect(list.status).toBe(200);
      expect(list.body.data.length).toBeGreaterThan(0);
      expect(list.body.data.every((d: { institutionId: number }) => d.institutionId === institutionId)).toBe(true);

      const failed = await request(app).get("/api/email-deliveries?status=FAILED").set("Authorization", `Bearer ${adminToken}`);
      expect(failed.body.data.every((d: { status: string }) => d.status === "FAILED")).toBe(true);

      const other = await request(app).get("/api/email-deliveries").set("Authorization", `Bearer ${otherAdminToken}`);
      expect(other.body.data).toHaveLength(0);

      const denied = await request(app).get("/api/email-deliveries").set("Authorization", `Bearer ${careerToken}`);
      expect(denied.status).toBe(403);
    });

    it("reports whether email is configured", async () => {
      const on = await request(app).get("/api/email-deliveries/status").set("Authorization", `Bearer ${careerToken}`);
      expect(on.body.data.configured).toBe(true);
      setMailTransportForTests(null);
      const off = await request(app).get("/api/email-deliveries/status").set("Authorization", `Bearer ${careerToken}`);
      expect(off.body.data.configured).toBe(false);
    });
  });
});
