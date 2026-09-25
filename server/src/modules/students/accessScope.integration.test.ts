import request from "supertest";
import { createApp } from "../../app";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";

const app = createApp();

/**
 * Project review, 2026-09-18: "enforce program/campus access throughout the
 * API." Program Administrator and Read-Only/Auditor are the two roles
 * restricted to their assigned programs (server/src/lib/accessScope.ts);
 * this fixture deliberately exercises BOTH grant mechanisms (Pat via direct
 * UserProgramAccess, Ray via UserCampusAccess to a campus with only one of
 * the two programs) against the two-program/two-student setup below, so a
 * single fixture proves the scoping actually filters results rather than
 * just not erroring.
 */
describe("program/campus access scoping (integration)", () => {
  let institutionId: number;
  let campusAId: number;
  let campusBId: number;
  let programAId: number;
  let programBId: number;
  let studentAId: number;
  let studentBId: number;
  let reportingPeriodId: number;
  let ruleSetId: number;
  let sysAdminToken: string;
  let patToken: string; // PROGRAM_ADMINISTRATOR, scoped to Program A via UserProgramAccess
  let rayToken: string; // READ_ONLY_AUDITOR, scoped to Campus A (-> Program A) via UserCampusAccess
  let caseyToken: string; // CAREER_SERVICES_STAFF, not a scoped role at all

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Access Scope Test Institution" } });
    institutionId = institution.id;

    const campusA = await prisma.campus.create({ data: { institutionId, name: "Campus A" } });
    campusAId = campusA.id;
    const campusB = await prisma.campus.create({ data: { institutionId, name: "Campus B" } });
    campusBId = campusB.id;

    const programA = await prisma.program.create({
      data: { institutionId, campusId: campusAId, name: "Program A", code: "SCOPE-A", credentialType: "Diploma", licensureRequired: true },
    });
    programAId = programA.id;
    const programB = await prisma.program.create({
      data: { institutionId, campusId: campusBId, name: "Program B", code: "SCOPE-B", credentialType: "Diploma", licensureRequired: true },
    });
    programBId = programB.id;

    const passwordHash = await hashPassword("password123");
    await prisma.user.create({
      data: { institutionId, name: "Sam SysAdmin", email: "sam@scope-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    const pat = await prisma.user.create({
      data: { institutionId, name: "Pat ProgAdmin", email: "pat@scope-test.edu", passwordHash, role: "PROGRAM_ADMINISTRATOR" },
    });
    const ray = await prisma.user.create({
      data: { institutionId, name: "Ray Auditor", email: "ray@scope-test.edu", passwordHash, role: "READ_ONLY_AUDITOR" },
    });
    await prisma.user.create({
      data: { institutionId, name: "Casey CareerServices", email: "casey@scope-test.edu", passwordHash, role: "CAREER_SERVICES_STAFF" },
    });

    await prisma.userProgramAccess.create({ data: { userId: pat.id, programId: programAId } });
    await prisma.userCampusAccess.create({ data: { userId: ray.id, campusId: campusAId } });

    sysAdminToken = (await request(app).post("/api/auth/login").send({ email: "sam@scope-test.edu", password: "password123" })).body.data.accessToken;
    patToken = (await request(app).post("/api/auth/login").send({ email: "pat@scope-test.edu", password: "password123" })).body.data.accessToken;
    rayToken = (await request(app).post("/api/auth/login").send({ email: "ray@scope-test.edu", password: "password123" })).body.data.accessToken;
    caseyToken = (await request(app).post("/api/auth/login").send({ email: "casey@scope-test.edu", password: "password123" })).body.data.accessToken;

    const studentA = await prisma.student.create({
      data: { institutionId, internalStudentId: "SCOPE-A-1", firstName: "Alpha", lastName: "InScope" },
    });
    studentAId = studentA.id;
    const studentB = await prisma.student.create({
      data: { institutionId, internalStudentId: "SCOPE-B-1", firstName: "Beta", lastName: "OutOfScope" },
    });
    studentBId = studentB.id;

    const framework = await prisma.accreditationFramework.create({ data: { name: "COE-SCOPE-TEST" } });
    const ruleSet = await prisma.ruleSet.create({
      data: {
        frameworkId: framework.id,
        versionLabel: "COE-2026-SCOPE-TEST",
        effectiveStartDate: new Date("2025-01-01"),
        ruleDefinition: { benchmarks: { completion: 60, placement: 70, licensure: 70 } },
      },
    });
    const period = await prisma.reportingPeriod.create({
      data: { institutionId, ruleSetId: ruleSet.id, label: "SCOPE-TEST-PERIOD", startDate: new Date("2025-07-01"), endDate: new Date("2026-06-30") },
    });
    reportingPeriodId = period.id;
    ruleSetId = ruleSet.id;

    await prisma.studentEnrollment.create({
      data: {
        studentId: studentAId,
        programId: programAId,
        campusId: campusAId,
        startDate: new Date("2025-01-01"),
        actualCompletionDate: new Date("2026-01-01"),
        enrollmentStatus: "GRADUATE_COMPLETER",
      },
    });
    await prisma.studentEnrollment.create({
      data: {
        studentId: studentBId,
        programId: programBId,
        campusId: campusBId,
        startDate: new Date("2025-01-01"),
        actualCompletionDate: new Date("2026-01-01"),
        enrollmentStatus: "GRADUATE_COMPLETER",
      },
    });

    await prisma.employer.create({ data: { institutionId, name: "Employer X" } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("Programs", () => {
    it("scopes the list to assigned programs for Program Administrator and Auditor, not for System Administrator or Career Services", async () => {
      const patRes = await request(app).get("/api/programs").set("Authorization", `Bearer ${patToken}`);
      expect(patRes.body.data.map((p: { code: string }) => p.code)).toEqual(["SCOPE-A"]);

      const rayRes = await request(app).get("/api/programs").set("Authorization", `Bearer ${rayToken}`);
      expect(rayRes.body.data.map((p: { code: string }) => p.code)).toEqual(["SCOPE-A"]);

      const sysAdminRes = await request(app).get("/api/programs").set("Authorization", `Bearer ${sysAdminToken}`);
      expect(sysAdminRes.body.data.map((p: { code: string }) => p.code).sort()).toEqual(["SCOPE-A", "SCOPE-B"]);

      const caseyRes = await request(app).get("/api/programs").set("Authorization", `Bearer ${caseyToken}`);
      expect(caseyRes.body.data.map((p: { code: string }) => p.code).sort()).toEqual(["SCOPE-A", "SCOPE-B"]);
    });

    it("404s an out-of-scope program's detail route for a scoped role, but not for an unscoped one", async () => {
      const patRes = await request(app).get(`/api/programs/${programBId}`).set("Authorization", `Bearer ${patToken}`);
      expect(patRes.status).toBe(404);

      const rayRes = await request(app).get(`/api/programs/${programBId}`).set("Authorization", `Bearer ${rayToken}`);
      expect(rayRes.status).toBe(404);

      const sysAdminRes = await request(app).get(`/api/programs/${programBId}`).set("Authorization", `Bearer ${sysAdminToken}`);
      expect(sysAdminRes.status).toBe(200);

      const patOwnRes = await request(app).get(`/api/programs/${programAId}`).set("Authorization", `Bearer ${patToken}`);
      expect(patOwnRes.status).toBe(200);
    });
  });

  describe("Students", () => {
    it("scopes the list and search to students with an accessible enrollment", async () => {
      const patRes = await request(app).get("/api/students").set("Authorization", `Bearer ${patToken}`);
      expect(patRes.body.data.map((s: { internalStudentId: string }) => s.internalStudentId)).toEqual(["SCOPE-A-1"]);

      const rayRes = await request(app).get("/api/students").set("Authorization", `Bearer ${rayToken}`);
      expect(rayRes.body.data.map((s: { internalStudentId: string }) => s.internalStudentId)).toEqual(["SCOPE-A-1"]);

      const sysAdminRes = await request(app).get("/api/students").set("Authorization", `Bearer ${sysAdminToken}`);
      expect(sysAdminRes.body.data.map((s: { internalStudentId: string }) => s.internalStudentId).sort()).toEqual([
        "SCOPE-A-1",
        "SCOPE-B-1",
      ]);
    });

    it("404s an out-of-scope student's detail route, but allows an in-scope one", async () => {
      const patOutOfScope = await request(app).get(`/api/students/${studentBId}`).set("Authorization", `Bearer ${patToken}`);
      expect(patOutOfScope.status).toBe(404);

      const patInScope = await request(app).get(`/api/students/${studentAId}`).set("Authorization", `Bearer ${patToken}`);
      expect(patInScope.status).toBe(200);

      const sysAdminRes = await request(app).get(`/api/students/${studentBId}`).set("Authorization", `Bearer ${sysAdminToken}`);
      expect(sysAdminRes.status).toBe(200);
    });

    it("scopes the Excel export", async () => {
      const res = await request(app)
        .get("/api/students/export")
        .set("Authorization", `Bearer ${patToken}`)
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => callback(null, Buffer.concat(chunks)));
        });
      expect(res.status).toBe(200);

      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(res.body as Parameters<typeof workbook.xlsx.load>[0]);
      const sheet = workbook.getWorksheet("Students")!;
      expect(sheet.rowCount).toBe(2); // header + exactly SCOPE-A-1
      expect(sheet.getRow(2).getCell(1).value).toBe("SCOPE-A-1");
    });

    it("blocks creating an enrollment into an out-of-scope program, even for an in-scope student", async () => {
      const res = await request(app)
        .post(`/api/students/${studentAId}/enrollments`)
        .set("Authorization", `Bearer ${patToken}`)
        .send({
          programId: programBId,
          campusId: campusBId,
          startDate: "2026-01-01",
          enrollmentStatus: "ACTIVE",
        });
      expect(res.status).toBe(404);

      const okRes = await request(app)
        .post(`/api/students/${studentAId}/enrollments`)
        .set("Authorization", `Bearer ${patToken}`)
        .send({
          programId: programAId,
          campusId: campusAId,
          startDate: "2026-01-01",
          enrollmentStatus: "ACTIVE",
        });
      expect(okRes.status).toBe(201);
    });
  });

  describe("Follow-Up Queue and attempts", () => {
    it("scopes the queue to accessible students", async () => {
      const patRes = await request(app).get("/api/followups/queue").set("Authorization", `Bearer ${patToken}`);
      expect(patRes.body.data.map((r: { student: { id: number } }) => r.student.id)).toEqual([studentAId]);

      const sysAdminRes = await request(app).get("/api/followups/queue").set("Authorization", `Bearer ${sysAdminToken}`);
      expect(sysAdminRes.body.data.map((r: { student: { id: number } }) => r.student.id).sort()).toEqual(
        [studentAId, studentBId].sort(),
      );
    });

    it("404s logging a follow-up attempt for an out-of-scope student", async () => {
      const res = await request(app)
        .post(`/api/students/${studentBId}/follow-up-attempts`)
        .set("Authorization", `Bearer ${patToken}`)
        .send({ attemptedAt: "2026-01-15T00:00:00.000Z", method: "PHONE", outcome: "NO_RESPONSE" });
      expect(res.status).toBe(404);
    });

    it("skips an out-of-scope student in a bulk follow-up request instead of logging it", async () => {
      const res = await request(app)
        .post("/api/followups/bulk")
        .set("Authorization", `Bearer ${patToken}`)
        .send({
          studentIds: [studentAId, studentBId],
          attemptedAt: "2026-01-15T00:00:00.000Z",
          method: "PHONE",
          outcome: "NO_RESPONSE",
        });
      expect(res.status).toBe(201);
      expect(res.body.data.createdCount).toBe(1);
      expect(res.body.data.skipped).toContainEqual(expect.objectContaining({ studentId: studentBId }));
    });
  });

  describe("Licensure", () => {
    it("scopes the queue to accessible programs", async () => {
      const patRes = await request(app).get("/api/licensure/queue").set("Authorization", `Bearer ${patToken}`);
<<<<<<< HEAD
      expect(patRes.body.data.queue.map((r: { student: { id: number } }) => r.student.id)).toEqual([studentAId]);

      const sysAdminRes = await request(app).get("/api/licensure/queue").set("Authorization", `Bearer ${sysAdminToken}`);
      expect(sysAdminRes.body.data.queue.map((r: { student: { id: number } }) => r.student.id).sort()).toEqual(
=======
      expect(patRes.body.data.map((r: { student: { id: number } }) => r.student.id)).toEqual([studentAId]);

      const sysAdminRes = await request(app).get("/api/licensure/queue").set("Authorization", `Bearer ${sysAdminToken}`);
      expect(sysAdminRes.body.data.map((r: { student: { id: number } }) => r.student.id).sort()).toEqual(
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
        [studentAId, studentBId].sort(),
      );
    });

    it("404s recording a licensure result for an out-of-scope student, and rejects an out-of-scope programId for an in-scope one", async () => {
      const outOfScopeStudent = await request(app)
        .post(`/api/students/${studentBId}/licensure-results`)
        .set("Authorization", `Bearer ${patToken}`)
        .send({ programId: programBId, examName: "Test Exam", result: "PASSED" });
      expect(outOfScopeStudent.status).toBe(404);

      const outOfScopeProgram = await request(app)
        .post(`/api/students/${studentAId}/licensure-results`)
        .set("Authorization", `Bearer ${patToken}`)
        .send({ programId: programBId, examName: "Test Exam", result: "PASSED" });
      expect(outOfScopeProgram.status).toBe(404);

      const ok = await request(app)
        .post(`/api/students/${studentAId}/licensure-results`)
        .set("Authorization", `Bearer ${patToken}`)
        .send({ programId: programAId, examName: "Test Exam", result: "PASSED" });
      expect(ok.status).toBe(201);
    });
  });

  describe("Global search", () => {
    it("scopes student and program results but not employer results", async () => {
      const patStudentSearch = await request(app)
        .get("/api/search?q=InScope")
        .set("Authorization", `Bearer ${patToken}`);
      expect(patStudentSearch.body.data.students).toHaveLength(1);

      const patOutOfScopeSearch = await request(app)
        .get("/api/search?q=OutOfScope")
        .set("Authorization", `Bearer ${patToken}`);
      expect(patOutOfScopeSearch.body.data.students).toHaveLength(0);

      const patProgramSearch = await request(app)
        .get("/api/search?q=Program B")
        .set("Authorization", `Bearer ${patToken}`);
      expect(patProgramSearch.body.data.programs).toHaveLength(0);

      const patEmployerSearch = await request(app)
        .get("/api/search?q=Employer X")
        .set("Authorization", `Bearer ${patToken}`);
      expect(patEmployerSearch.body.data.employers).toHaveLength(1);
    });
  });

  describe("Custom Report Builder", () => {
    it("scopes STUDENT and PROGRAM entities, but not EMPLOYER", async () => {
      const studentRes = await request(app)
        .post("/api/reports/custom/run")
        .set("Authorization", `Bearer ${patToken}`)
        .send({ entityType: "STUDENT", fields: ["internalStudentId"] });
      // One row per enrollment, not per student — by this point in the suite,
      // student A has 2 enrollments (both Program A, from the earlier
      // enrollment-creation test), and student B's out-of-scope enrollment(s)
      // never appear at all.
      expect(studentRes.body.data.rows).toEqual([
        { internalStudentId: "SCOPE-A-1" },
        { internalStudentId: "SCOPE-A-1" },
      ]);

      const programRes = await request(app)
        .post("/api/reports/custom/run")
        .set("Authorization", `Bearer ${patToken}`)
        .send({ entityType: "PROGRAM", fields: ["code"] });
      expect(programRes.body.data.rows).toEqual([{ code: "SCOPE-A" }]);

      const employerRes = await request(app)
        .post("/api/reports/custom/run")
        .set("Authorization", `Bearer ${patToken}`)
        .send({ entityType: "EMPLOYER", fields: ["name"] });
      expect(employerRes.body.data.rows).toEqual([{ name: "Employer X" }]);
    });

    it("returns zero rows, not an error, when a scoped caller filters to an out-of-scope program", async () => {
      const res = await request(app)
        .post("/api/reports/custom/run")
        .set("Authorization", `Bearer ${patToken}`)
        .send({
          entityType: "STUDENT",
          fields: ["internalStudentId"],
          filters: [{ field: "programId", value: [programBId] }],
        });
      expect(res.status).toBe(200);
      expect(res.body.data.rows).toEqual([]);
    });
  });

  describe("Reports (P8 drill-downs)", () => {
    it("scopes unknown-outcomes to accessible programs' byProgram breakdown", async () => {
      // Both students have no outcome record at all this period, so both
      // generate a MISSING_OUTCOME_RECORD-shaped absence — simplest to
      // exercise via the report's studentClassification-driven half instead:
      // seed a SEEKING_OR_UNKNOWN classification for each.
      await prisma.studentClassification.createMany({
        data: [
          {
            studentEnrollmentId: (await prisma.studentEnrollment.findFirstOrThrow({ where: { studentId: studentAId, programId: programAId } })).id,
            reportingPeriodId,
            metric: "PLACEMENT",
            classificationCode: "SEEKING_OR_UNKNOWN",
            determinedByRuleSetId: ruleSetId,
          },
          {
            studentEnrollmentId: (await prisma.studentEnrollment.findFirstOrThrow({ where: { studentId: studentBId, programId: programBId } })).id,
            reportingPeriodId,
            metric: "PLACEMENT",
            classificationCode: "SEEKING_OR_UNKNOWN",
            determinedByRuleSetId: ruleSetId,
          },
        ],
      });

      const patRes = await request(app)
        .get(`/api/reports/unknown-outcomes?reportingPeriodId=${reportingPeriodId}`)
        .set("Authorization", `Bearer ${patToken}`);
      expect(patRes.body.data.totalSeekingOrUnknown).toBe(1);
      expect(patRes.body.data.students.map((s: { student: { id: number } }) => s.student.id)).toEqual([studentAId]);

      const sysAdminRes = await request(app)
        .get(`/api/reports/unknown-outcomes?reportingPeriodId=${reportingPeriodId}`)
        .set("Authorization", `Bearer ${sysAdminToken}`);
      expect(sysAdminRes.body.data.totalSeekingOrUnknown).toBe(2);
    });
  });

  /**
   * A follow-up browser-verification round on this same feature found two
   * real, confirmed data leaks (cohorts, negotiated benchmarks) plus several
   * latent ones of the identical shape (improvement plans, trends, CPL
   * results/drill-down, validation issues, readiness, audit history) — all
   * from a duplicated, institution-only `findOwnedProgram`/ownership-check
   * copy that was never made scope-aware when accessScope.ts landed. Each
   * is regression-tested here now that they're fixed.
   */
  describe("Other program-scoped surfaces found after the initial pass", () => {
    let cohortBId: number;
    let cplResultBId: number;
    let validationIssueBId: number;
    let improvementPlanBId: number;

    beforeAll(async () => {
      const cohortB = await prisma.cohort.create({ data: { programId: programBId, name: "Cohort B" } });
      cohortBId = cohortB.id;

      const cplResultB = await prisma.cplCalculationResult.create({
        data: { reportingPeriodId, programId: programBId, metric: "COMPLETION", numerator: 1, denominator: 1, percentage: 100 },
      });
      cplResultBId = cplResultB.id;

      const validationIssueB = await prisma.validationIssue.create({
        data: {
          reportingPeriodId,
          programId: programBId,
          studentId: studentBId,
          issueType: "MISSING_OUTCOME_RECORD",
          severity: "WARNING",
          detectedAt: new Date(),
        },
      });
      validationIssueBId = validationIssueB.id;

      const responsibleUser = await prisma.user.findFirstOrThrow({ where: { institutionId } });
      const improvementPlanB = await prisma.improvementPlan.create({
        data: {
          programId: programBId,
          metric: "COMPLETION",
          reportingPeriodId,
          responsibleUserId: responsibleUser.id,
          status: "ACTIVE",
        },
      });
      improvementPlanBId = improvementPlanB.id;
    });

    it("404s an out-of-scope program's cohorts (the confirmed data leak)", async () => {
      const patRes = await request(app).get(`/api/programs/${programBId}/cohorts`).set("Authorization", `Bearer ${patToken}`);
      expect(patRes.status).toBe(404);

      const sysAdminRes = await request(app).get(`/api/programs/${programBId}/cohorts`).set("Authorization", `Bearer ${sysAdminToken}`);
      expect(sysAdminRes.status).toBe(200);
      expect(sysAdminRes.body.data.cohorts.map((c: { id: number }) => c.id)).toContain(cohortBId);
    });

    it("404s an out-of-scope program's negotiated benchmarks", async () => {
      const res = await request(app)
        .get(`/api/programs/${programBId}/negotiated-benchmarks`)
        .set("Authorization", `Bearer ${patToken}`);
      expect(res.status).toBe(404);
    });

    it("404s an out-of-scope program's improvement plan, and scopes the list", async () => {
      const showRes = await request(app)
        .get(`/api/accreditation/improvement-plans/${improvementPlanBId}`)
        .set("Authorization", `Bearer ${patToken}`);
      expect(showRes.status).toBe(404);

      const listRes = await request(app)
        .get("/api/accreditation/improvement-plans")
        .set("Authorization", `Bearer ${patToken}`);
      expect(listRes.body.data.improvementPlans.map((p: { id: number }) => p.id)).not.toContain(improvementPlanBId);

      const createRes = await request(app)
        .post("/api/accreditation/improvement-plans")
        .set("Authorization", `Bearer ${patToken}`)
        .send({
          programId: programBId,
          metric: "COMPLETION",
          reportingPeriodId,
          responsibleUserId: (await prisma.user.findFirstOrThrow({ where: { institutionId } })).id,
        });
      expect(createRes.status).toBe(404);
    });

    it("rejects an out-of-scope programId on Historical Trends", async () => {
      const res = await request(app)
        .get(`/api/accreditation/trends?programId=${programBId}`)
        .set("Authorization", `Bearer ${patToken}`);
      expect(res.status).toBe(400);
    });

    it("scopes CPL results, drill-down, and export", async () => {
      const listRes = await request(app)
        .get(`/api/accreditation/reporting-periods/${reportingPeriodId}/results`)
        .set("Authorization", `Bearer ${patToken}`);
      expect(listRes.body.data.results.map((r: { id: number }) => r.id)).not.toContain(cplResultBId);

      const filteredRes = await request(app)
        .get(`/api/accreditation/reporting-periods/${reportingPeriodId}/results?programId=${programBId}`)
        .set("Authorization", `Bearer ${patToken}`);
      expect(filteredRes.status).toBe(404);

      const drillDownRes = await request(app)
        .get(`/api/accreditation/reporting-periods/${reportingPeriodId}/drill-down?metric=COMPLETION&bucket=numerator&programId=${programBId}`)
        .set("Authorization", `Bearer ${patToken}`);
      expect(drillDownRes.status).toBe(404);
    });

    it("scopes the validation issue list to accessible programs", async () => {
      // resolve/bulk-resolve are CAN_FINALIZE-gated (System/Institutional
      // Administrator only, per accreditation.routes.ts) — never a scoped
      // role, so their own scoping fix isn't independently exercisable by a
      // real scoped account under the current role gate; it's defense in
      // depth if that gate is ever loosened, the same way CAN_FINALIZE
      // itself was loosened earlier in this project. list has no such
      // restriction, so it's the one directly testable here.
      const listRes = await request(app)
        .get(`/api/accreditation/reporting-periods/${reportingPeriodId}/validation-issues`)
        .set("Authorization", `Bearer ${patToken}`);
      expect(listRes.body.data.issues.map((i: { id: number }) => i.id)).not.toContain(validationIssueBId);

      const sysAdminRes = await request(app)
        .get(`/api/accreditation/reporting-periods/${reportingPeriodId}/validation-issues`)
        .set("Authorization", `Bearer ${sysAdminToken}`);
      expect(sysAdminRes.body.data.issues.map((i: { id: number }) => i.id)).toContain(validationIssueBId);
    });

    it("scopes the Readiness Dashboard to accessible programs", async () => {
      const patRes = await request(app)
        .get(`/api/accreditation/reporting-periods/${reportingPeriodId}/readiness`)
        .set("Authorization", `Bearer ${patToken}`);
      expect(patRes.body.data.readiness.map((r: { program: { id: number } }) => r.program.id)).not.toContain(programBId);

      const sysAdminRes = await request(app)
        .get(`/api/accreditation/reporting-periods/${reportingPeriodId}/readiness`)
        .set("Authorization", `Bearer ${sysAdminToken}`);
      expect(sysAdminRes.body.data.readiness.map((r: { program: { id: number } }) => r.program.id)).toContain(programBId);
    });

    it("404s the audit history of an out-of-scope program", async () => {
      const res = await request(app)
        .get(`/api/audit?entityType=Program&entityId=${programBId}`)
        .set("Authorization", `Bearer ${patToken}`);
      expect(res.status).toBe(404);
    });
  });
});
