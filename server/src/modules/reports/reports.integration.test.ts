import request from "supertest";
import { createApp } from "../../app";
import { computeReportingPeriod } from "../accreditation/calculators/cplCalculator";
import { runValidation } from "../accreditation/validators/validationEngine";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import { runWithRequestContext } from "../../lib/requestContext";

const app = createApp();

/**
 * Advanced Drill-Down Reports (Phase 2 P8): one deliberately-designed
 * fixture (4 completers with distinct data-completeness levels, plus a
 * separate follow-up-attempt fixture) exercised against all five reports,
 * so each assertion checks a specific, hand-computed number rather than
 * just "some data came back."
 */
describe("advanced drill-down reports (integration)", () => {
  let institutionId: number;
  let campusId: number;
  let programId: number;
  let reportingPeriodId: number;
  let userId: number;
  let adminToken: string;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Reports Test Institution" } });
    institutionId = institution.id;

    const campus = await prisma.campus.create({ data: { institutionId, name: "Main Campus" } });
    campusId = campus.id;

    const program = await prisma.program.create({
      data: { institutionId, campusId, name: "Automotive Technology", code: "AUTO-100", credentialType: "Diploma" },
    });
    programId = program.id;

    const passwordHash = await hashPassword("password123");
    const admin = await prisma.user.create({
      data: { institutionId, name: "Admin", email: "admin@reports-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    userId = admin.id;
    const casey = await prisma.user.create({
      data: { institutionId, name: "Casey", email: "casey@reports-test.edu", passwordHash, role: "CAREER_SERVICES_STAFF" },
    });
    const jordan = await prisma.user.create({
      data: { institutionId, name: "Jordan", email: "jordan@reports-test.edu", passwordHash, role: "CAREER_SERVICES_STAFF" },
    });

    const adminLogin = await request(app).post("/api/auth/login").send({ email: "admin@reports-test.edu", password: "password123" });
    adminToken = adminLogin.body.data.accessToken;

    const framework = await prisma.accreditationFramework.create({ data: { name: "COE-REPORTS-TEST" } });
    const ruleSet = await prisma.ruleSet.create({
      data: {
        frameworkId: framework.id,
        versionLabel: "COE-2026-REPORTS-TEST",
        effectiveStartDate: new Date("2025-01-01"),
        ruleDefinition: { benchmarks: { completion: 60, placement: 70, licensure: 70 } },
      },
    });
    const period = await prisma.reportingPeriod.create({
      data: { institutionId, ruleSetId: ruleSet.id, label: "REPORTS-TEST-PERIOD", startDate: new Date("2025-07-01"), endDate: new Date("2026-06-30") },
    });
    reportingPeriodId = period.id;

    const employer = await prisma.employer.create({ data: { institutionId, name: "Test Employer Inc" } });

    async function makeCompleter(label: string) {
      const student = await prisma.student.create({
        data: { institutionId, internalStudentId: `REPORT-${label}`, firstName: label, lastName: "Student" },
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

    // Alice: employed & related, quick placement (14 days), verified, WITH evidence, full-time, waged.
    const alice = await makeCompleter("Alice");
    const aliceOutcome = await prisma.studentOutcomeRecord.create({
      data: {
        studentEnrollmentId: alice.enrollment.id,
        reportingPeriodId,
        licensureRequired: false,
        employmentStatus: "EMPLOYED",
        employerId: employer.id,
        relatedToTraining: true,
        employmentStartDate: new Date("2026-01-15"),
        verificationStatus: "VERIFIED",
      },
    });
    await prisma.evidence.create({
      data: { outcomeRecordId: aliceOutcome.id, evidenceType: "EMPLOYER_VERIFICATION", fileReference: "alice.txt", uploadedBy: "Test Fixture" },
    });
    await prisma.employmentRecord.create({
      data: {
        studentId: alice.student.id,
        employerId: employer.id,
        jobTitle: "Automotive Technician",
        startDate: new Date("2026-01-15"),
        fullTime: true,
        relatedToTraining: true,
        salaryOrWage: 45000,
        employmentStatus: "EMPLOYED",
        verificationStatus: "VERIFIED",
      },
    });

    // Bob: employed & related, slow placement (90 days), verified, NO evidence, part-time, no wage on file.
    const bob = await makeCompleter("Bob");
    await prisma.studentOutcomeRecord.create({
      data: {
        studentEnrollmentId: bob.enrollment.id,
        reportingPeriodId,
        licensureRequired: false,
        employmentStatus: "EMPLOYED",
        employerId: employer.id,
        relatedToTraining: true,
        employmentStartDate: new Date("2026-04-01"),
        verificationStatus: "VERIFIED",
      },
    });
    await prisma.employmentRecord.create({
      data: {
        studentId: bob.student.id,
        employerId: employer.id,
        jobTitle: "Automotive Technician",
        startDate: new Date("2026-04-01"),
        fullTime: false,
        relatedToTraining: true,
        employmentStatus: "EMPLOYED",
        verificationStatus: "VERIFIED",
      },
    });

    // Carol: no outcome record at all — MISSING_OUTCOME_RECORD, and the classifier
    // treats "no outcome record" as SEEKING_OR_UNKNOWN for Placement.
    await makeCompleter("Carol");

    // Dave: has an outcome record, but status UNKNOWN — SEEKING_OR_UNKNOWN, but
    // NOT a MISSING_OUTCOME_RECORD issue, since a record does exist.
    const dave = await makeCompleter("Dave");
    await prisma.studentOutcomeRecord.create({
      data: {
        studentEnrollmentId: dave.enrollment.id,
        reportingPeriodId,
        licensureRequired: false,
        employmentStatus: "UNKNOWN",
      },
    });

    await runWithRequestContext({ userId }, () => computeReportingPeriod(reportingPeriodId));
    await runValidation(reportingPeriodId);

    // Independent follow-up-attempt fixture (not period-scoped).
    const followUpStudent = await prisma.student.create({
      data: { institutionId, internalStudentId: "REPORT-FollowUp", firstName: "FollowUp", lastName: "Student" },
    });
    await prisma.followUpAttempt.create({
      data: { studentId: followUpStudent.id, staffUserId: casey.id, attemptedAt: new Date("2026-01-10"), method: "PHONE", outcome: "NO_RESPONSE" },
    });
    await prisma.followUpAttempt.create({
      data: { studentId: followUpStudent.id, staffUserId: casey.id, attemptedAt: new Date("2026-01-20"), method: "PHONE", outcome: "EMPLOYMENT_REPORTED" },
    });
    await prisma.followUpAttempt.create({
      data: { studentId: followUpStudent.id, staffUserId: jordan.id, attemptedAt: new Date("2026-01-05"), method: "EMAIL", outcome: "NO_RESPONSE" },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects reports without authentication", async () => {
    const res = await request(app).get(`/api/reports/time-to-employment?reportingPeriodId=${reportingPeriodId}`);
    expect(res.status).toBe(401);
  });

  it("Time-to-Employment: averages Alice's 14 days and Bob's 90 days, bucketed correctly", async () => {
    const res = await request(app)
      .get(`/api/reports/time-to-employment?reportingPeriodId=${reportingPeriodId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.overall).toMatchObject({ count: 2, averageDays: 52, medianDays: 52 });
    expect(res.body.data.distribution).toMatchObject({ immediate30: 1, days31to60: 0, days61to90: 1, over90: 0 });
    expect(res.body.data.byProgram[0]).toMatchObject({
      program: { name: "Automotive Technology" },
      count: 2,
      averageDays: 52,
    });
  });

  it("Placement Quality: 50% full-time, 100% verified, one wage on file", async () => {
    const res = await request(app)
      .get(`/api/reports/placement-quality?reportingPeriodId=${reportingPeriodId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      totalPlacements: 2,
      fullTimeRate: 50,
      relatedRate: 100,
      verifiedRate: 100,
      averageWage: 45000,
      wageRecordCount: 1,
    });
  });

  it("Outcome Funnel: 4 completers narrowing down to 1 with evidence on file", async () => {
    const res = await request(app)
      .get(`/api/reports/outcome-funnel?reportingPeriodId=${reportingPeriodId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.stages).toEqual([
      { stage: "Completers", count: 4 },
      { stage: "Employed", count: 2 },
      { stage: "Employed, Related", count: 2 },
      { stage: "Verified", count: 2 },
      { stage: "Evidence on File", count: 1 },
    ]);
  });

  it("Unknown Outcomes: Carol (no record) and Dave (UNKNOWN status) both count as seeking/unknown, only Carol is missing a record", async () => {
    const res = await request(app)
      .get(`/api/reports/unknown-outcomes?reportingPeriodId=${reportingPeriodId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalSeekingOrUnknown).toBe(2);
    expect(res.body.data.totalMissingRecord).toBe(1);
    const names = res.body.data.students.map((s: { student: { firstName: string } }) => s.student.firstName).sort();
    expect(names).toEqual(["Carol", "Dave"]);
  });

  it("Follow-Up Effectiveness: 1 of 3 attempts resolved, Casey's 50% rate beats Jordan's 0%", async () => {
    const res = await request(app)
      .get("/api/reports/follow-up-effectiveness")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalAttempts).toBeGreaterThanOrEqual(3);
    const caseyStaff = res.body.data.byStaff.find((s: { staffUser: { name: string } }) => s.staffUser.name === "Casey");
    const jordanStaff = res.body.data.byStaff.find((s: { staffUser: { name: string } }) => s.staffUser.name === "Jordan");
    expect(caseyStaff).toMatchObject({ attempts: 2, resolvingRate: 50 });
    expect(jordanStaff).toMatchObject({ attempts: 1, resolvingRate: 0 });
  });
});
