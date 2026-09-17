import request from "supertest";
import { createApp } from "../../app";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";

const app = createApp();

/** Phase 2 P11 (docs/TODO.md): bulk-logging follow-up attempts from the queue. */
describe("bulk follow-up attempts (integration)", () => {
  let institutionId: number;
  let studentA: number;
  let studentB: number;
  let doNotContactStudent: number;
  let outsideInstitutionStudent: number;
  let adminToken: string;
  let auditorToken: string;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Bulk Follow-Up Test Institution" } });
    institutionId = institution.id;
    const otherInstitution = await prisma.institution.create({ data: { name: "Other Institution" } });

    studentA = await prisma.student
      .create({ data: { institutionId, internalStudentId: "BULK-A", firstName: "A", lastName: "Student" } })
      .then((s) => s.id);
    studentB = await prisma.student
      .create({ data: { institutionId, internalStudentId: "BULK-B", firstName: "B", lastName: "Student" } })
      .then((s) => s.id);

    const dncStudent = await prisma.student.create({
      data: { institutionId, internalStudentId: "BULK-DNC", firstName: "DoNotContact", lastName: "Student" },
    });
    doNotContactStudent = dncStudent.id;
    await prisma.studentCommunicationPreference.create({
      data: { studentId: doNotContactStudent, doNotContact: true, doNotContactReason: "Requested" },
    });

    outsideInstitutionStudent = await prisma.student
      .create({ data: { institutionId: otherInstitution.id, internalStudentId: "BULK-OUT", firstName: "Outside", lastName: "Student" } })
      .then((s) => s.id);

    const passwordHash = await hashPassword("password123");
    await prisma.user.create({
      data: { institutionId, name: "Admin", email: "admin@bulk-followup-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    await prisma.user.create({
      data: { institutionId, name: "Auditor", email: "auditor@bulk-followup-test.edu", passwordHash, role: "READ_ONLY_AUDITOR" },
    });

    const adminLogin = await request(app).post("/api/auth/login").send({ email: "admin@bulk-followup-test.edu", password: "password123" });
    adminToken = adminLogin.body.data.accessToken;
    const auditorLogin = await request(app).post("/api/auth/login").send({ email: "auditor@bulk-followup-test.edu", password: "password123" });
    auditorToken = auditorLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects without authentication", async () => {
    const res = await request(app).post("/api/followups/bulk").send({
      studentIds: [studentA],
      attemptedAt: "2026-01-15T10:00:00Z",
      method: "PHONE",
      outcome: "NO_RESPONSE",
    });
    expect(res.status).toBe(401);
  });

  it("rejects a Read-Only Auditor", async () => {
    const res = await request(app)
      .post("/api/followups/bulk")
      .set("Authorization", `Bearer ${auditorToken}`)
      .send({ studentIds: [studentA], attemptedAt: "2026-01-15T10:00:00Z", method: "PHONE", outcome: "NO_RESPONSE" });
    expect(res.status).toBe(403);
  });

  it("logs the same attempt for multiple eligible students, skipping do-not-contact and cross-institution ids", async () => {
    const res = await request(app)
      .post("/api/followups/bulk")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        studentIds: [studentA, studentB, doNotContactStudent, outsideInstitutionStudent, 999999999],
        attemptedAt: "2026-01-15T10:00:00Z",
        method: "PHONE",
        outcome: "NO_RESPONSE",
        notes: "Bulk campaign, no answer",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.createdCount).toBe(2);
    expect(res.body.data.skipped).toEqual(
      expect.arrayContaining([
        { studentId: doNotContactStudent, reason: "Flagged do-not-contact" },
        { studentId: outsideInstitutionStudent, reason: "Student not found" },
        { studentId: 999999999, reason: "Student not found" },
      ]),
    );

    const attemptsA = await prisma.followUpAttempt.findMany({ where: { studentId: studentA } });
    const attemptsB = await prisma.followUpAttempt.findMany({ where: { studentId: studentB } });
    expect(attemptsA).toHaveLength(1);
    expect(attemptsB).toHaveLength(1);
    expect(attemptsA[0]).toMatchObject({ outcome: "NO_RESPONSE", notes: "Bulk campaign, no answer" });

    const dncAttempts = await prisma.followUpAttempt.findMany({ where: { studentId: doNotContactStudent } });
    expect(dncAttempts).toHaveLength(0);
  });
});
