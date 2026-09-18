import request from "supertest";
import { createApp } from "../../app";
import { computeReportingPeriod } from "../accreditation/calculators/cplCalculator";
import { runValidation } from "../accreditation/validators/validationEngine";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import { runWithRequestContext } from "../../lib/requestContext";

const app = createApp();

/** "Missing-outcomes digest" (docs/TODO.md deferred items): a pushed notification, vs. the pull-based Validation tab. */
describe("missing-outcomes digest + notifications (integration)", () => {
  let institutionId: number;
  let reportingPeriodId: number;
  let userId: number;
  let adminToken: string;
  let careerServicesToken: string;
  let auditorToken: string;
  let careerServicesUserId: number;
  let auditorUserId: number;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Digest Test Institution" } });
    institutionId = institution.id;
    const campus = await prisma.campus.create({ data: { institutionId, name: "Main Campus" } });
    const program = await prisma.program.create({
      data: { institutionId, campusId: campus.id, name: "Automotive Technology", code: "DIGEST-100", credentialType: "Diploma" },
    });

    const passwordHash = await hashPassword("password123");
    const admin = await prisma.user.create({
      data: { institutionId, name: "Admin", email: "admin@digest-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    userId = admin.id;
    const careerServices = await prisma.user.create({
      data: { institutionId, name: "Career Services", email: "careerservices@digest-test.edu", passwordHash, role: "CAREER_SERVICES_STAFF" },
    });
    careerServicesUserId = careerServices.id;
    const auditor = await prisma.user.create({
      data: { institutionId, name: "Auditor", email: "auditor@digest-test.edu", passwordHash, role: "READ_ONLY_AUDITOR" },
    });
    auditorUserId = auditor.id;

    adminToken = (await request(app).post("/api/auth/login").send({ email: "admin@digest-test.edu", password: "password123" })).body.data.accessToken;
    careerServicesToken = (await request(app).post("/api/auth/login").send({ email: "careerservices@digest-test.edu", password: "password123" })).body.data.accessToken;
    auditorToken = (await request(app).post("/api/auth/login").send({ email: "auditor@digest-test.edu", password: "password123" })).body.data.accessToken;

    const framework = await prisma.accreditationFramework.create({ data: { name: "COE-DIGEST-TEST" } });
    const ruleSet = await prisma.ruleSet.create({
      data: {
        frameworkId: framework.id,
        versionLabel: "COE-2026-DIGEST-TEST",
        effectiveStartDate: new Date("2025-01-01"),
        ruleDefinition: { benchmarks: { completion: 60, placement: 70, licensure: 70 } },
      },
    });
    const period = await prisma.reportingPeriod.create({
      data: {
        institutionId,
        ruleSetId: ruleSet.id,
        label: "DIGEST-TEST-PERIOD",
        startDate: new Date("2025-07-01"),
        endDate: new Date("2026-06-30"),
      },
    });
    reportingPeriodId = period.id;

    const unknownStudent = await prisma.student.create({
      data: { institutionId, internalStudentId: "DIGEST-UNKNOWN", firstName: "Unknown", lastName: "Student" },
    });
    const unknownEnrollment = await prisma.studentEnrollment.create({
      data: {
        studentId: unknownStudent.id,
        programId: program.id,
        campusId: campus.id,
        startDate: new Date("2025-01-01"),
        actualCompletionDate: new Date("2026-01-01"),
        enrollmentStatus: "GRADUATE_COMPLETER",
      },
    });
    await prisma.studentOutcomeRecord.create({
      data: { studentEnrollmentId: unknownEnrollment.id, reportingPeriodId, licensureRequired: false, employmentStatus: "UNKNOWN" },
    });

    await runWithRequestContext({ userId }, () => computeReportingPeriod(reportingPeriodId));
    await runValidation(reportingPeriodId);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects a Read-Only Auditor from generating a digest", async () => {
    const res = await request(app)
      .post("/api/notifications/missing-outcomes-digest")
      .set("Authorization", `Bearer ${auditorToken}`)
      .send({ reportingPeriodId });
    expect(res.status).toBe(403);
  });

  it("404s for a reporting period in another institution", async () => {
    const res = await request(app)
      .post("/api/notifications/missing-outcomes-digest")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reportingPeriodId: 999999999 });
    expect(res.status).toBe(404);
  });

  it("any authenticated user (including auditor) can read their own empty notification inbox", async () => {
    const res = await request(app).get("/api/notifications").set("Authorization", `Bearer ${auditorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.notifications).toEqual([]);
    expect(res.body.data.unreadCount).toBe(0);
  });

  it("generates a digest sent to every operational-role user, not the auditor", async () => {
    const res = await request(app)
      .post("/api/notifications/missing-outcomes-digest")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reportingPeriodId });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ recipientCount: 2, unresolvedCount: 1 });

    const adminInbox = await request(app).get("/api/notifications").set("Authorization", `Bearer ${adminToken}`);
    expect(adminInbox.body.data.unreadCount).toBe(1);
    expect(adminInbox.body.data.notifications[0]).toMatchObject({
      type: "MISSING_OUTCOMES_DIGEST",
      referenceEntityType: "ReportingPeriod",
      referenceEntityId: reportingPeriodId,
    });
    expect(adminInbox.body.data.notifications[0].message).toMatch(/1 student.*DIGEST-TEST-PERIOD/);

    const careerServicesInbox = await request(app).get("/api/notifications").set("Authorization", `Bearer ${careerServicesToken}`);
    expect(careerServicesInbox.body.data.unreadCount).toBe(1);

    const auditorInbox = await request(app).get("/api/notifications").set("Authorization", `Bearer ${auditorToken}`);
    expect(auditorInbox.body.data.notifications).toEqual([]);
  });

  it("marks a single notification read", async () => {
    const inbox = await request(app).get("/api/notifications").set("Authorization", `Bearer ${adminToken}`);
    const notificationId = inbox.body.data.notifications[0].id;

    const res = await request(app)
      .patch(`/api/notifications/${notificationId}/read`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.notification.readAt).not.toBeNull();

    const updatedInbox = await request(app).get("/api/notifications").set("Authorization", `Bearer ${adminToken}`);
    expect(updatedInbox.body.data.unreadCount).toBe(0);
  });

  it("cannot mark another user's notification read", async () => {
    const careerServicesInbox = await request(app).get("/api/notifications").set("Authorization", `Bearer ${careerServicesToken}`);
    const notificationId = careerServicesInbox.body.data.notifications[0].id;

    const res = await request(app)
      .patch(`/api/notifications/${notificationId}/read`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it("mark-all-read clears every unread notification for that user", async () => {
    const res = await request(app)
      .patch("/api/notifications/read-all")
      .set("Authorization", `Bearer ${careerServicesToken}`);
    expect(res.status).toBe(200);

    const inbox = await request(app).get("/api/notifications").set("Authorization", `Bearer ${careerServicesToken}`);
    expect(inbox.body.data.unreadCount).toBe(0);
  });

  it("sends no digest and creates no notifications once nothing is unresolved", async () => {
    // Resolve the one unresolved student's outcome, then re-run classification.
    const outcomeRecord = await prisma.studentOutcomeRecord.findFirstOrThrow({
      where: { studentEnrollment: { student: { internalStudentId: "DIGEST-UNKNOWN" } } },
    });
    await prisma.studentOutcomeRecord.update({
      where: { id: outcomeRecord.id },
      data: {
        employmentStatus: "EMPLOYED",
        relatedToTraining: true,
        relatedToTrainingJustification: "Matches curriculum.",
        verificationStatus: "VERIFIED",
      },
    });
    await runWithRequestContext({ userId }, () => computeReportingPeriod(reportingPeriodId));

    const res = await request(app)
      .post("/api/notifications/missing-outcomes-digest")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reportingPeriodId });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ recipientCount: 0, unresolvedCount: 0 });

    const notificationCount = await prisma.notification.count({ where: { userId: { in: [userId, careerServicesUserId, auditorUserId] } } });
    // Still just the 2 from the earlier digest (1 already read, 1 marked all-read) -- no new ones added.
    expect(notificationCount).toBe(2);
  });
});
