import request from "supertest";
import { createApp } from "../../app";
import { computeReportingPeriod } from "../accreditation/calculators/cplCalculator";
import { runValidation } from "../accreditation/validators/validationEngine";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import { runWithRequestContext } from "../../lib/requestContext";

const app = createApp();

/**
 * "Quarterly graduate outreach campaign" (docs/TODO.md deferred items): a
 * batched survey send targeting exactly the population reports.ts's Unknown
 * Outcomes report shows — SEEKING_OR_UNKNOWN classification or no outcome
 * record at all — skipping anyone who already has a pending, unanswered
 * survey out.
 */
describe("graduate outreach campaign (integration)", () => {
  let institutionId: number;
  let programId: number;
  let campusId: number;
  let reportingPeriodId: number;
  let userId: number;
  let adminToken: string;
  let auditorToken: string;
  let unknownStudentId: number;
  let missingRecordStudentId: number;
  let alreadyPendingStudentId: number;
  let resolvedStudentId: number;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Graduate Campaign Test Institution" } });
    institutionId = institution.id;
    const campus = await prisma.campus.create({ data: { institutionId, name: "Main Campus" } });
    campusId = campus.id;
    const program = await prisma.program.create({
      data: { institutionId, campusId, name: "Automotive Technology", code: "CAMP-100", credentialType: "Diploma" },
    });
    programId = program.id;

    const passwordHash = await hashPassword("password123");
    const admin = await prisma.user.create({
      data: { institutionId, name: "Admin", email: "admin@campaign-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    userId = admin.id;
    await prisma.user.create({
      data: { institutionId, name: "Auditor", email: "auditor@campaign-test.edu", passwordHash, role: "READ_ONLY_AUDITOR" },
    });
    adminToken = (await request(app).post("/api/auth/login").send({ email: "admin@campaign-test.edu", password: "password123" })).body.data.accessToken;
    auditorToken = (await request(app).post("/api/auth/login").send({ email: "auditor@campaign-test.edu", password: "password123" })).body.data.accessToken;

    const framework = await prisma.accreditationFramework.create({ data: { name: "COE-CAMPAIGN-TEST" } });
    const ruleSet = await prisma.ruleSet.create({
      data: {
        frameworkId: framework.id,
        versionLabel: "COE-2026-CAMPAIGN-TEST",
        effectiveStartDate: new Date("2025-01-01"),
        ruleDefinition: { benchmarks: { completion: 60, placement: 70, licensure: 70 } },
      },
    });
    const period = await prisma.reportingPeriod.create({
      data: {
        institutionId,
        ruleSetId: ruleSet.id,
        label: "CAMPAIGN-TEST-PERIOD",
        startDate: new Date("2025-07-01"),
        endDate: new Date("2026-06-30"),
      },
    });
    reportingPeriodId = period.id;

    async function makeCompleter(label: string) {
      const student = await prisma.student.create({
        data: { institutionId, internalStudentId: `CAMP-${label}`, firstName: label, lastName: "Student" },
      });
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
      return { student, enrollment };
    }

    // Unknown: has an outcome record, but employmentStatus UNKNOWN -> SEEKING_OR_UNKNOWN.
    const unknown = await makeCompleter("Unknown");
    unknownStudentId = unknown.student.id;
    await prisma.studentOutcomeRecord.create({
      data: { studentEnrollmentId: unknown.enrollment.id, reportingPeriodId, licensureRequired: false, employmentStatus: "UNKNOWN" },
    });

    // Missing record entirely -> both SEEKING_OR_UNKNOWN (classifier's null-outcome
    // fallback) AND MISSING_OUTCOME_RECORD -- must be deduplicated to one survey.
    const missing = await makeCompleter("Missing");
    missingRecordStudentId = missing.student.id;

    // Already has a pending (unanswered) graduate survey -- should be skipped, not double-sent.
    const alreadyPending = await makeCompleter("AlreadyPending");
    alreadyPendingStudentId = alreadyPending.student.id;
    await prisma.studentOutcomeRecord.create({
      data: { studentEnrollmentId: alreadyPending.enrollment.id, reportingPeriodId, licensureRequired: false, employmentStatus: "UNKNOWN" },
    });

    // Fully resolved -- not part of the target population at all.
    const resolved = await makeCompleter("Resolved");
    resolvedStudentId = resolved.student.id;
    await prisma.studentOutcomeRecord.create({
      data: {
        studentEnrollmentId: resolved.enrollment.id,
        reportingPeriodId,
        licensureRequired: false,
        employmentStatus: "EMPLOYED",
        relatedToTraining: true,
        relatedToTrainingJustification: "Matches curriculum.",
        verificationStatus: "VERIFIED",
      },
    });

    await runWithRequestContext({ userId }, () => computeReportingPeriod(reportingPeriodId));
    await runValidation(reportingPeriodId);

    // Created after validation so it doesn't affect the MISSING_OUTCOME_RECORD count above.
    const { randomUUID } = await import("node:crypto");
    await prisma.graduateSurvey.create({
      data: { studentId: alreadyPendingStudentId, sentAt: new Date(), responseToken: randomUUID() },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects a Read-Only Auditor from starting a campaign", async () => {
    const res = await request(app)
      .post("/api/surveys/graduate-campaign")
      .set("Authorization", `Bearer ${auditorToken}`)
      .send({ reportingPeriodId });
    expect(res.status).toBe(403);
  });

  it("404s for a reporting period in another institution", async () => {
    const res = await request(app)
      .post("/api/surveys/graduate-campaign")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reportingPeriodId: 999999999 });
    expect(res.status).toBe(404);
  });

  let sentTokensByStudent: Map<number, string>;

  it("targets unresolved students, dedupes, skips the one with a pending survey, and excludes the resolved one", async () => {
    const res = await request(app)
      .post("/api/surveys/graduate-campaign")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reportingPeriodId, channel: "EMAIL" });

    expect(res.status).toBe(201);
    // Targeted: unknown, missing, alreadyPending = 3 (resolved is not part of the population at all).
    expect(res.body.data.targetedCount).toBe(3);
    expect(res.body.data.sentCount).toBe(2);
    expect(res.body.data.skipped).toEqual([
      { studentId: alreadyPendingStudentId, reason: "Already has a pending graduate survey" },
    ]);

    const sentSurveys = await prisma.graduateSurvey.findMany({
      where: { studentId: { in: [unknownStudentId, missingRecordStudentId] }, sentAt: { gte: new Date(Date.now() - 60_000) } },
    });
    expect(sentSurveys).toHaveLength(2);
    sentTokensByStudent = new Map(sentSurveys.map((s) => [s.studentId, s.responseToken]));

    // Only one survey was created for the "missing record" student despite
    // appearing in both underlying source queries.
    const missingStudentSurveys = await prisma.graduateSurvey.findMany({ where: { studentId: missingRecordStudentId } });
    expect(missingStudentSurveys).toHaveLength(1);

    const resolvedStudentSurveys = await prisma.graduateSurvey.findMany({ where: { studentId: resolvedStudentId } });
    expect(resolvedStudentSurveys).toHaveLength(0);
  });

  it("recorded a GRADUATE_SURVEY_SENT communication event for each newly sent survey", async () => {
    const events = await prisma.communicationEvent.findMany({
      where: { studentId: unknownStudentId, eventType: "GRADUATE_SURVEY_SENT" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.summaryText).toMatch(/quarterly outreach campaign/i);
  });

  it("the newly-sent surveys are real, individually respondable public surveys", async () => {
    const token = sentTokensByStudent.get(unknownStudentId)!;
    const res = await request(app).get(`/api/public/surveys/graduate/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.alreadyResponded).toBe(false);
  });
});
