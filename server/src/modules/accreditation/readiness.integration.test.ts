import request from "supertest";
import { createApp } from "../../app";
import { computeReportingPeriod } from "./calculators/cplCalculator";
import { runValidation } from "./validators/validationEngine";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import { runWithRequestContext } from "../../lib/requestContext";

const app = createApp();

/**
 * Covers the Readiness Dashboard (Phase 2 P2) and the negotiated-benchmark
 * override it depends on — specifically that a program below the standard
 * 60% completion benchmark is correctly flagged as not-ready and generates a
 * BELOW_BENCHMARK_COMPLETION validation issue, and that an approved
 * negotiated rate the program actually meets clears both, since the
 * Readiness Dashboard and Data Validation must never disagree about this.
 */
describe("accreditation readiness + negotiated benchmarks (integration)", () => {
  let institutionId: number;
  let campusId: number;
  let programId: number;
  let reportingPeriodId: number;
  let userId: number;
  let adminToken: string;
  let instructorToken: string;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Readiness Test Institution" } });
    institutionId = institution.id;

    const campus = await prisma.campus.create({ data: { institutionId, name: "Main Campus" } });
    campusId = campus.id;

    const program = await prisma.program.create({
      data: { institutionId, campusId, name: "Court Reporting", code: "CR-100", credentialType: "Diploma" },
    });
    programId = program.id;

    const employer = await prisma.employer.create({
      data: { institutionId, name: "Test Court Reporting Employer", address: "1 Main St", city: "Denver" },
    });

    const passwordHash = await hashPassword("password123");
    const admin = await prisma.user.create({
      data: { institutionId, name: "Admin", email: "admin@readiness-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    userId = admin.id;
    await prisma.user.create({
      data: { institutionId, name: "Instructor", email: "instructor@readiness-test.edu", passwordHash, role: "INSTRUCTOR_STAFF" },
    });

    const adminLogin = await request(app).post("/api/auth/login").send({ email: "admin@readiness-test.edu", password: "password123" });
    adminToken = adminLogin.body.data.accessToken;
    const instructorLogin = await request(app).post("/api/auth/login").send({ email: "instructor@readiness-test.edu", password: "password123" });
    instructorToken = instructorLogin.body.data.accessToken;

    const framework = await prisma.accreditationFramework.create({ data: { name: "COE-READINESS-TEST" } });
    const ruleSet = await prisma.ruleSet.create({
      data: {
        frameworkId: framework.id,
        versionLabel: "COE-2026-READINESS-TEST",
        effectiveStartDate: new Date("2025-01-01"),
        ruleDefinition: { benchmarks: { completion: 60, placement: 70, licensure: 70 } },
      },
    });
    const period = await prisma.reportingPeriod.create({
      data: {
        institutionId,
        ruleSetId: ruleSet.id,
        label: "READINESS-TEST-PERIOD",
        startDate: new Date("2025-07-01"),
        endDate: new Date("2026-06-30"),
      },
    });
    reportingPeriodId = period.id;

    // 2 graduate completers + 3 withdrawals = 40% completion, below the 60% standard benchmark.
    const statuses: Array<"GRADUATE_COMPLETER" | "WITHDRAWN"> = [
      "GRADUATE_COMPLETER",
      "GRADUATE_COMPLETER",
      "WITHDRAWN",
      "WITHDRAWN",
      "WITHDRAWN",
    ];
    for (const [i, status] of statuses.entries()) {
      const student = await prisma.student.create({
        data: { institutionId, internalStudentId: `READY-${i}`, firstName: "Test", lastName: `Student${i}` },
      });
      const enrollment = await prisma.studentEnrollment.create({
        data: {
          studentId: student.id,
          programId,
          campusId,
          startDate: new Date("2025-01-01"),
          actualCompletionDate: new Date("2026-01-15"),
          enrollmentStatus: status,
        },
      });

      // Both graduate completers are fully verified employed-related outcomes
      // (Placement comes out at 100%, well above its own 70% standard
      // benchmark — this test is specifically about the Completion negotiated
      // rate, not Placement) with an employer and evidence on file, and the
      // withdrawn students still get a (minimal) outcome record, so none of
      // this generates incidental EMPLOYMENT_WITHOUT_EMPLOYER/MISSING_EVIDENCE/
      // MISSING_OUTCOME_RECORD validation noise that would otherwise pollute
      // openIssueCount and make the "ready" assertions below meaningless.
      if (status === "GRADUATE_COMPLETER") {
        const outcome = await prisma.studentOutcomeRecord.create({
          data: {
            studentEnrollmentId: enrollment.id,
            reportingPeriodId,
            licensureRequired: false,
            employmentStatus: "EMPLOYED",
            employerId: employer.id,
            relatedToTraining: true,
            relatedToTrainingJustification: "Matches program curriculum.",
            verificationStatus: "VERIFIED",
          },
        });
        await prisma.evidence.create({
          data: {
            outcomeRecordId: outcome.id,
            evidenceType: "EMPLOYER_VERIFICATION",
            fileReference: "test-fixture-evidence.txt",
            uploadedBy: "Test Fixture",
          },
        });
      } else {
        await prisma.studentOutcomeRecord.create({
          data: { studentEnrollmentId: enrollment.id, reportingPeriodId, licensureRequired: false },
        });
      }
    }

    await runWithRequestContext({ userId }, () => computeReportingPeriod(reportingPeriodId));
    await runValidation(reportingPeriodId);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects creating a negotiated benchmark without authentication", async () => {
    const res = await request(app)
      .post(`/api/programs/${programId}/negotiated-benchmarks`)
      .send({ metric: "COMPLETION", approvedPercentage: 35, effectiveStartDate: "2025-01-01", approvalReference: "x" });
    expect(res.status).toBe(401);
  });

  it("rejects creating a negotiated benchmark as a non-admin role", async () => {
    const res = await request(app)
      .post(`/api/programs/${programId}/negotiated-benchmarks`)
      .set("Authorization", `Bearer ${instructorToken}`)
      .send({ metric: "COMPLETION", approvedPercentage: 35, effectiveStartDate: "2025-01-01", approvalReference: "x" });
    expect(res.status).toBe(403);
  });

  it("flags the program as below the standard completion benchmark before any negotiated rate exists", async () => {
    const res = await request(app)
      .get(`/api/accreditation/reporting-periods/${reportingPeriodId}/readiness`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const row = res.body.data.readiness.find((r: { program: { id: number } }) => r.program.id === programId);
    expect(row.metrics.COMPLETION).toMatchObject({ benchmark: 60, negotiated: false, meetsBenchmark: false });
    expect(row.ready).toBe(false);

    const issues = await prisma.validationIssue.findMany({ where: { reportingPeriodId, programId, resolvedAt: null } });
    expect(issues.map((i) => i.issueType)).toContain("BELOW_BENCHMARK_COMPLETION");
  });

  it("creates a negotiated benchmark covering the reporting period", async () => {
    const res = await request(app)
      .post(`/api/programs/${programId}/negotiated-benchmarks`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        metric: "COMPLETION",
        approvedPercentage: 35,
        effectiveStartDate: "2025-01-01",
        effectiveEndDate: "2026-12-31",
        approvalReference: "Commission letter dated 2025-01-01, court reporting completion negotiation",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.negotiatedBenchmark).toMatchObject({
      programId,
      metric: "COMPLETION",
      approvedPercentage: "35",
    });
  });

  it("lists the negotiated benchmark for the program", async () => {
    const res = await request(app)
      .get(`/api/programs/${programId}/negotiated-benchmarks`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.negotiatedBenchmarks).toHaveLength(1);
  });

  it("re-running validation no longer flags the program once the negotiated rate is met", async () => {
    await runValidation(reportingPeriodId);
    const issues = await prisma.validationIssue.findMany({ where: { reportingPeriodId, programId, resolvedAt: null } });
    expect(issues.map((i) => i.issueType)).not.toContain("BELOW_BENCHMARK_COMPLETION");
  });

  it("readiness dashboard now shows the program as ready, with the negotiated rate applied", async () => {
    const res = await request(app)
      .get(`/api/accreditation/reporting-periods/${reportingPeriodId}/readiness`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const row = res.body.data.readiness.find((r: { program: { id: number } }) => r.program.id === programId);
    expect(row.metrics.COMPLETION).toMatchObject({ benchmark: 35, negotiated: true, meetsBenchmark: true });
    expect(row.openIssueCount).toBe(0);
    expect(row.ready).toBe(true);
    expect(res.body.data.summary.readyPrograms).toBeGreaterThanOrEqual(1);
  });
});
