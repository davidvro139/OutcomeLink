import request from "supertest";
import { createApp } from "../../app";
import { runValidation } from "../accreditation/validators/validationEngine";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";

const app = createApp();

describe("student merge (integration)", () => {
  let institutionId: number;
  let otherInstitutionId: number;
  let johnA: number;
  let johnB: number;
  let johnC: number;
  let janeD: number;
  let outsideStudent: number;
  let adminToken: string;
  let auditorToken: string;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Merge Test Institution" } });
    institutionId = institution.id;
    const otherInstitution = await prisma.institution.create({ data: { name: "Other Institution" } });
    otherInstitutionId = otherInstitution.id;

    const makeStudent = (instId: number, tag: string, firstName: string, lastName: string, email?: string) =>
      prisma.student
        .create({ data: { institutionId: instId, internalStudentId: `MERGE-${tag}`, firstName, lastName, email } })
        .then((s) => s.id);

    johnA = await makeStudent(institutionId, "A", "John", "Smith", "john.a@example.com");
    johnB = await makeStudent(institutionId, "B", "  john ", " SMITH ", "john.b@example.com");
    johnC = await makeStudent(institutionId, "C", "John", "Smith", "john.c@example.com");
    janeD = await makeStudent(institutionId, "D", "Jane", "Doe");
    outsideStudent = await makeStudent(otherInstitutionId, "OUT", "John", "Smith");

    const passwordHash = await hashPassword("password123");
    await prisma.user.create({
      data: { institutionId, name: "Admin", email: "admin@merge-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    await prisma.user.create({
      data: { institutionId, name: "Auditor", email: "auditor@merge-test.edu", passwordHash, role: "READ_ONLY_AUDITOR" },
    });

    const adminLogin = await request(app).post("/api/auth/login").send({ email: "admin@merge-test.edu", password: "password123" });
    adminToken = adminLogin.body.data.accessToken;
    const auditorLogin = await request(app).post("/api/auth/login").send({ email: "auditor@merge-test.edu", password: "password123" });
    auditorToken = auditorLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("duplicate candidates", () => {
    it("rejects without authentication", async () => {
      const res = await request(app).get(`/api/students/${johnA}/duplicate-candidates`);
      expect(res.status).toBe(401);
    });

    it("404s for an unknown student", async () => {
      const res = await request(app)
        .get("/api/students/999999999/duplicate-candidates")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });

    it("finds other students with the same normalized name, excluding self, other institutions, and non-matches", async () => {
      const res = await request(app)
        .get(`/api/students/${johnA}/duplicate-candidates`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.candidates.map((c: { id: number }) => c.id).sort((a: number, b: number) => a - b);
      expect(ids).toEqual([johnB, johnC].sort((a, b) => a - b));
      expect(ids).not.toContain(janeD);
      expect(ids).not.toContain(outsideStudent);
    });

    it("excludes a candidate that has already been merged away", async () => {
      await request(app)
        .post(`/api/students/${johnA}/merge`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ mergedStudentId: johnC, reason: "Duplicate data entry" });

      const res = await request(app)
        .get(`/api/students/${johnB}/duplicate-candidates`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.candidates.map((c: { id: number }) => c.id);
      expect(ids).toContain(johnA);
      expect(ids).not.toContain(johnC);
    });
  });

  describe("merge action", () => {
    it("rejects a Read-Only Auditor from merging", async () => {
      const res = await request(app)
        .post(`/api/students/${johnA}/merge`)
        .set("Authorization", `Bearer ${auditorToken}`)
        .send({ mergedStudentId: johnB, reason: "test" });
      expect(res.status).toBe(403);
    });

    it("rejects merging a student into itself", async () => {
      const res = await request(app)
        .post(`/api/students/${johnA}/merge`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ mergedStudentId: johnA, reason: "test" });
      expect(res.status).toBe(400);
    });

    it("rejects re-merging a student that's already been merged away", async () => {
      // johnC was already merged into johnA in the "duplicate candidates" block above.
      const res = await request(app)
        .post(`/api/students/${johnB}/merge`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ mergedStudentId: johnC, reason: "test" });
      expect(res.status).toBe(409);
    });

    it("rejects merging INTO a student that has itself already been merged away", async () => {
      // johnC is already merged away (its survivor is johnA), so it can no longer be a survivor.
      const res = await request(app)
        .post(`/api/students/${johnC}/merge`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ mergedStudentId: johnB, reason: "test" });
      expect(res.status).toBe(409);
    });

    it("reassigns child records and reconciles communication preferences on merge", async () => {
      const survivor = janeD;
      const merged = await prisma.student
        .create({ data: { institutionId, internalStudentId: "MERGE-E", firstName: "Jane", lastName: "Doe" } })
        .then((s) => s.id);

      const campus = await prisma.campus.create({ data: { institutionId, name: "Main Campus" } });
      const program = await prisma.program.create({
        data: { institutionId, campusId: campus.id, name: "Test Program", code: "MRG-100", credentialType: "Diploma" },
      });
      await prisma.studentEnrollment.create({
        data: {
          studentId: merged,
          programId: program.id,
          campusId: campus.id,
          startDate: new Date("2025-01-01"),
          enrollmentStatus: "ACTIVE",
        },
      });
      await prisma.studentCommunicationPreference.create({
        data: { studentId: merged, doNotContact: true, doNotContactReason: "Requested by family" },
      });

      const res = await request(app)
        .post(`/api/students/${survivor}/merge`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ mergedStudentId: merged, reason: "Confirmed same person via enrollment records" });

      expect(res.status).toBe(200);
      expect(res.body.data.student.communicationPreference).toMatchObject({ doNotContact: true });
      expect(res.body.data.mergeLog).toMatchObject({
        survivingStudentId: survivor,
        mergedStudentId: merged,
        performedBy: "Admin",
      });

      const reassignedEnrollments = await prisma.studentEnrollment.findMany({ where: { studentId: survivor } });
      expect(reassignedEnrollments).toHaveLength(1);

      const orphanedPreference = await prisma.studentCommunicationPreference.findUnique({
        where: { studentId: merged },
      });
      expect(orphanedPreference).toBeNull();
    });
  });
});

/**
 * Confirms merging actually resolves the POSSIBLE_DUPLICATE_STUDENT check
 * long-term, not just for the moment it's clicked — validationEngine.ts's
 * duplicate-name scan runs against every student row every time, and merge.ts
 * never deletes the merged-away row (kept for audit history), so without an
 * explicit exclusion a merged pair would be re-flagged on every future run.
 */
describe("merging resolves the duplicate-student validation check for good (integration)", () => {
  it("no longer flags a pair after they've been merged, even on a later run", async () => {
    const institution = await prisma.institution.create({ data: { name: "Merge Revalidation Test" } });
    const framework = await prisma.accreditationFramework.create({ data: { name: "COE-MERGE-REVALIDATION" } });
    const ruleSet = await prisma.ruleSet.create({
      data: {
        frameworkId: framework.id,
        versionLabel: "COE-2026-MERGE-REVALIDATION",
        effectiveStartDate: new Date("2025-01-01"),
        ruleDefinition: { benchmarks: { completion: 60, placement: 70, licensure: 70 } },
      },
    });
    const period = await prisma.reportingPeriod.create({
      data: {
        institutionId: institution.id,
        ruleSetId: ruleSet.id,
        label: "MERGE-REVALIDATION-PERIOD",
        startDate: new Date("2025-07-01"),
        endDate: new Date("2026-06-30"),
      },
    });

    const survivor = await prisma.student.create({
      data: { institutionId: institution.id, internalStudentId: "REVAL-1", firstName: "Pat", lastName: "Nguyen" },
    });
    const duplicate = await prisma.student.create({
      data: { institutionId: institution.id, internalStudentId: "REVAL-2", firstName: "Pat", lastName: "Nguyen" },
    });

    await runValidation(period.id);
    const beforeMerge = await prisma.validationIssue.findMany({
      where: { reportingPeriodId: period.id, issueType: "POSSIBLE_DUPLICATE_STUDENT" },
    });
    expect(beforeMerge.map((i) => i.studentId).sort()).toEqual([survivor.id, duplicate.id].sort());

    const passwordHash = await hashPassword("password123");
    await prisma.user.create({
      data: {
        institutionId: institution.id,
        name: "Admin",
        email: "admin@merge-revalidation.edu",
        passwordHash,
        role: "SYSTEM_ADMINISTRATOR",
      },
    });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@merge-revalidation.edu", password: "password123" });
    const token = login.body.data.accessToken;

    const mergeRes = await request(app)
      .post(`/api/students/${survivor.id}/merge`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mergedStudentId: duplicate.id, reason: "Confirmed same person" });
    expect(mergeRes.status).toBe(200);

    await runValidation(period.id);
    const afterMerge = await prisma.validationIssue.findMany({
      where: {
        reportingPeriodId: period.id,
        issueType: "POSSIBLE_DUPLICATE_STUDENT",
        studentId: { in: [survivor.id, duplicate.id] },
        resolvedAt: null,
      },
    });
    expect(afterMerge).toHaveLength(0);
  });
});
