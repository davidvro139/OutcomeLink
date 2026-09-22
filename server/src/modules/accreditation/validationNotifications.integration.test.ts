import request from "supertest";
import { createApp } from "../../app";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import { runValidationAndNotify } from "./validation";
import { runNightlyValidation } from "./validationScheduler";

const app = createApp();

describe("runValidationAndNotify (integration)", () => {
  let institutionId: number;
  let campusId: number;
  let programId: number;
  let reportingPeriodId: number;
  let programAdminId: number;
  let institutionAdminId: number;
  let adminToken: string;

  async function makeCompleterWithNoOutcomeRecord(label: string) {
    const student = await prisma.student.create({
      data: { institutionId, internalStudentId: `VN-${label}`, firstName: "Val", lastName: label },
    });
    await prisma.studentEnrollment.create({
      data: {
        studentId: student.id,
        programId,
        campusId,
        startDate: new Date("2025-01-01"),
        actualCompletionDate: new Date("2026-01-01"),
        enrollmentStatus: "GRADUATE_COMPLETER",
      },
    });
    return student.id;
  }

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Validation Notify Test Institution" } });
    institutionId = institution.id;
    const campus = await prisma.campus.create({ data: { institutionId, name: "Main Campus" } });
    campusId = campus.id;
    const program = await prisma.program.create({
      data: { institutionId, campusId, name: "Automotive Technology", code: "VN-AUTO", credentialType: "Diploma" },
    });
    programId = program.id;

    const passwordHash = await hashPassword("password123");
    const institutionAdmin = await prisma.user.create({
      data: { institutionId, name: "Institution Admin", email: "instadmin@validation-notify-test.edu", passwordHash, role: "INSTITUTIONAL_ADMINISTRATOR" },
    });
    institutionAdminId = institutionAdmin.id;
    adminToken = (await request(app).post("/api/auth/login").send({ email: "instadmin@validation-notify-test.edu", password: "password123" })).body.data.accessToken;
    const programAdmin = await prisma.user.create({
      data: { institutionId, name: "Program Admin", email: "programadmin@validation-notify-test.edu", passwordHash, role: "PROGRAM_ADMINISTRATOR" },
    });
    programAdminId = programAdmin.id;
    await prisma.userProgramAccess.create({ data: { userId: programAdminId, programId } });

    const framework = await prisma.accreditationFramework.create({ data: { name: "COE-VN-TEST" } });
    const ruleSet = await prisma.ruleSet.create({
      data: {
        frameworkId: framework.id,
        versionLabel: "COE-2026-VN-TEST",
        effectiveStartDate: new Date("2025-01-01"),
        ruleDefinition: { benchmarks: { completion: 60, placement: 70, licensure: 70 } },
      },
    });
    const period = await prisma.reportingPeriod.create({
      data: { institutionId, ruleSetId: ruleSet.id, label: "VN-TEST-PERIOD", startDate: new Date("2025-07-01"), endDate: new Date("2026-06-30"), status: "OPEN" },
    });
    reportingPeriodId = period.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: [programAdminId, institutionAdminId] } } });
  });

  it("notifies the program's admin for a newly-detected ERROR issue, targeting only ERROR severity", async () => {
    await makeCompleterWithNoOutcomeRecord("1");

    await runValidationAndNotify(reportingPeriodId, institutionId);

    const issues = await prisma.validationIssue.findMany({ where: { reportingPeriodId, issueType: "MISSING_OUTCOME_RECORD" } });
    expect(issues.length).toBeGreaterThan(0);

    const notifications = await prisma.notification.findMany({ where: { userId: programAdminId, type: "VALIDATION_ERROR" } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.message).toContain("new validation error");
  });

  it("does not re-notify for an issue that's still open from the prior run", async () => {
    await runValidationAndNotify(reportingPeriodId, institutionId);
    const notifications = await prisma.notification.findMany({ where: { userId: programAdminId, type: "VALIDATION_ERROR" } });
    expect(notifications).toHaveLength(0);
  });

  it("notifies again for the same natural-key issue once it's been resolved and recurs", async () => {
    const openIssues = await prisma.validationIssue.findMany({ where: { reportingPeriodId, issueType: "MISSING_OUTCOME_RECORD", resolvedAt: null } });
    await prisma.validationIssue.updateMany({
      where: { id: { in: openIssues.map((i) => i.id) } },
      data: { resolvedAt: new Date(), resolvedBy: "test" },
    });

    // The underlying condition (no outcome record) still exists, so the next
    // run's delete-and-recreate produces it again — absent from the "before"
    // OPEN set (since it was just marked resolved), so it counts as new.
    await runValidationAndNotify(reportingPeriodId, institutionId);
    const notifications = await prisma.notification.findMany({ where: { userId: programAdminId, type: "VALIDATION_ERROR" } });
    expect(notifications).toHaveLength(1);
  });

  it("falls back to institution admins when the issue's program has no configured owner and no accessible Program Administrator", async () => {
    await prisma.userProgramAccess.deleteMany({ where: { userId: programAdminId, programId } });
    await prisma.validationIssue.updateMany({ where: { reportingPeriodId }, data: { resolvedAt: new Date(), resolvedBy: "test" } });

    await runValidationAndNotify(reportingPeriodId, institutionId);

    const programAdminNotifications = await prisma.notification.findMany({ where: { userId: programAdminId, type: "VALIDATION_ERROR" } });
    expect(programAdminNotifications).toHaveLength(0);
    const institutionAdminNotifications = await prisma.notification.findMany({ where: { userId: institutionAdminId, type: "VALIDATION_ERROR" } });
    expect(institutionAdminNotifications).toHaveLength(1);

    await prisma.userProgramAccess.create({ data: { userId: programAdminId, programId } });
  });

  it("the manual /validate endpoint uses the same notify-on-new-issue behavior", async () => {
    await prisma.validationIssue.updateMany({ where: { reportingPeriodId }, data: { resolvedAt: new Date(), resolvedBy: "test" } });
    await makeCompleterWithNoOutcomeRecord("2");

    const res = await request(app)
      .post(`/api/accreditation/reporting-periods/${reportingPeriodId}/validate`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const notifications = await prisma.notification.findMany({ where: { userId: programAdminId, type: "VALIDATION_ERROR" } });
    expect(notifications).toHaveLength(1);
  });

  it("runNightlyValidation runs across every active-status period without throwing", async () => {
    await expect(runNightlyValidation()).resolves.toBeUndefined();
  });
});
