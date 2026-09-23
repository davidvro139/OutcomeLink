import request from "supertest";
import { createApp } from "../app";
import { hashPassword } from "./password";
import { prisma } from "./prisma";
import { runWithRequestContext } from "./requestContext";

const app = createApp();

/** Audit logging for upsert writes (docs/TODO.md's "audit upsert operations"). */
describe("audit log covers upsert (integration)", () => {
  let institutionId: number;
  let adminId: number;
  let adminToken: string;
  let studentId: number;

  const entries = (entityType: string, entityId: number) =>
    prisma.auditLogEntry.findMany({ where: { entityType, entityId }, orderBy: { id: "asc" } });

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Audit Upsert Institution" } });
    institutionId = institution.id;
    const passwordHash = await hashPassword("password123");
    const admin = await prisma.user.create({
      data: { institutionId, name: "Admin", email: "admin@audit-upsert.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    adminId = admin.id;
    adminToken = (await request(app).post("/api/auth/login").send({ email: "admin@audit-upsert.edu", password: "password123" })).body.data.accessToken;
    const student = await prisma.student.create({
      data: { institutionId, internalStudentId: "AU-1", firstName: "Audit", lastName: "Student" },
    });
    studentId = student.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("communication preference (filed under the Student)", () => {
    const put = (body: object) =>
      request(app).put(`/api/students/${studentId}/communication-preference`).set("Authorization", `Bearer ${adminToken}`).send(body);

    it("logs the initial values, then only genuinely changed fields, on the student's own history", async () => {
      expect((await put({ doNotContact: true, doNotContactReason: "Asked us to stop" })).status).toBe(200);
      const created = await entries("Student", studentId);
      expect(created.map((e) => e.fieldChanged).sort()).toEqual([
        "communicationPreference.doNotContact",
        "communicationPreference.doNotContactReason",
      ]);
      expect(created.every((e) => e.userId === adminId && e.previousValue === null)).toBe(true);
      expect(created.find((e) => e.fieldChanged === "communicationPreference.doNotContact")!.newValue).toBe("true");

      // Re-submitting the same values is a no-op — no phantom entries.
      await put({ doNotContact: true, doNotContactReason: "Asked us to stop" });
      expect(await entries("Student", studentId)).toHaveLength(2);

      // Clearing the flag logs exactly that change, with the previous value.
      await put({ doNotContact: false });
      const all = await entries("Student", studentId);
      expect(all).toHaveLength(3);
      expect(all[2]).toMatchObject({
        fieldChanged: "communicationPreference.doNotContact",
        previousValue: "true",
        newValue: "false",
      });
    });

    it("is visible through the existing audit history endpoint for the student", async () => {
      const res = await request(app).get(`/api/audit?entityType=Student&entityId=${studentId}`).set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.entries.some((e: { fieldChanged: string }) => e.fieldChanged === "communicationPreference.doNotContact")).toBe(true);
    });
  });

  describe("saved reports", () => {
    it("logs a CREATE, then a JSON-definition change on re-save, and nothing for an identical re-save", async () => {
      const save = (definition: object) =>
        request(app)
          .post("/api/reports/custom/saved")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ name: "Audited Report", definition });

      const first = await save({ entityType: "EMPLOYER", fields: ["name"] });
      const id = first.body.data.savedReport.id;
      expect((await entries("SavedReport", id)).map((e) => e.action)).toEqual(["CREATE"]);

      await save({ fields: ["name"], entityType: "EMPLOYER" }); // same content, different key order
      expect(await entries("SavedReport", id)).toHaveLength(1);

      await save({ entityType: "EMPLOYER", fields: ["name", "industry"] });
      const after = await entries("SavedReport", id);
      expect(after).toHaveLength(2);
      expect(after[1]).toMatchObject({ action: "UPDATE", fieldChanged: "definition" });
      expect(after[1]!.newValue).toContain("industry");
    });
  });

  it("does not log the derived CPL classification upserts, but proves the same context does log others", async () => {
    const campus = await prisma.campus.create({ data: { institutionId, name: "Main" } });
    const program = await prisma.program.create({
      data: { institutionId, campusId: campus.id, name: "P", code: "AU-P", credentialType: "Diploma" },
    });
    const enrollment = await prisma.studentEnrollment.create({
      data: { studentId, programId: program.id, campusId: campus.id, startDate: new Date("2025-01-01"), enrollmentStatus: "ACTIVE" },
    });
    const framework = await prisma.accreditationFramework.create({ data: { name: "AU-FW" } });
    const ruleSet = await prisma.ruleSet.create({
      data: { frameworkId: framework.id, versionLabel: "AU-RS", effectiveStartDate: new Date("2025-01-01"), ruleDefinition: {} },
    });
    const period = await prisma.reportingPeriod.create({
      data: { institutionId, ruleSetId: ruleSet.id, label: "AU-P1", startDate: new Date("2025-07-01"), endDate: new Date("2026-06-30") },
    });

    await runWithRequestContext({ userId: adminId }, async () => {
      const classification = await prisma.studentClassification.upsert({
        where: { studentEnrollmentId_reportingPeriodId_metric: { studentEnrollmentId: enrollment.id, reportingPeriodId: period.id, metric: "COMPLETION" } },
        create: { studentEnrollmentId: enrollment.id, reportingPeriodId: period.id, metric: "COMPLETION", classificationCode: "X", determinedByRuleSetId: ruleSet.id },
        update: { classificationCode: "Y" },
      });
      await prisma.cplCalculationExplanation.upsert({
        where: { studentClassificationId: classification.id },
        create: { studentClassificationId: classification.id, countsInNumerator: true, countsInDenominator: true, reasonText: "r" },
        update: { reasonText: "r2" },
      });
      // Control: an audited model written in the very same context does log.
      await prisma.programFollowUpOwner.upsert({
        where: { programId: program.id },
        create: { institutionId, programId: program.id, staffUserId: adminId },
        update: { staffUserId: adminId },
      });
    });

    expect(await prisma.auditLogEntry.count({ where: { entityType: { in: ["StudentClassification", "CplCalculationExplanation"] } } })).toBe(0);
    expect(await prisma.auditLogEntry.count({ where: { entityType: "ProgramFollowUpOwner" } })).toBe(1);
  });
});
