import request from "supertest";
import { createApp } from "../../app";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";

const app = createApp();

describe("licensure results (integration)", () => {
  let institutionId: number;
  let campusId: number;
  let programId: number;
  let studentId: number;
  let adminToken: string;
  let auditorToken: string;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Licensure Test Institution" } });
    institutionId = institution.id;

    const campus = await prisma.campus.create({ data: { institutionId, name: "Main Campus" } });
    campusId = campus.id;

    const program = await prisma.program.create({
      data: {
        institutionId,
        campusId,
        name: "Practical Nursing",
        code: "PN-100",
        credentialType: "Diploma",
        licensureRequired: true,
      },
    });
    programId = program.id;

    const student = await prisma.student.create({
      data: { institutionId, internalStudentId: "LIC-1", firstName: "Test", lastName: "Student" },
    });
    studentId = student.id;

    const passwordHash = await hashPassword("password123");
    await prisma.user.create({
      data: { institutionId, name: "Admin", email: "admin@licensure-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    await prisma.user.create({
      data: { institutionId, name: "Auditor", email: "auditor@licensure-test.edu", passwordHash, role: "READ_ONLY_AUDITOR" },
    });

    const adminLogin = await request(app).post("/api/auth/login").send({ email: "admin@licensure-test.edu", password: "password123" });
    adminToken = adminLogin.body.data.accessToken;

    const auditorLogin = await request(app).post("/api/auth/login").send({ email: "auditor@licensure-test.edu", password: "password123" });
    auditorToken = auditorLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects creating a licensure result without authentication", async () => {
    const res = await request(app)
      .post(`/api/students/${studentId}/licensure-results`)
      .send({ programId, examName: "NCLEX-PN", result: "SCHEDULED" });
    expect(res.status).toBe(401);
  });

  it("rejects creating a licensure result as a read-only auditor", async () => {
    const res = await request(app)
      .post(`/api/students/${studentId}/licensure-results`)
      .set("Authorization", `Bearer ${auditorToken}`)
      .send({ programId, examName: "NCLEX-PN", result: "SCHEDULED" });
    expect(res.status).toBe(403);
  });

  let resultId: number;

  it("creates a licensure result, auto-assigning attemptNumber 1", async () => {
    const res = await request(app)
      .post(`/api/students/${studentId}/licensure-results`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ programId, examName: "NCLEX-PN", result: "SCHEDULED", scheduledDate: "2026-03-01" });

    expect(res.status).toBe(201);
    expect(res.body.data.licensureResult).toMatchObject({
      programId,
      examName: "NCLEX-PN",
      result: "SCHEDULED",
      attemptNumber: 1,
    });
    resultId = res.body.data.licensureResult.id;
  });

  it("rejects an unknown programId", async () => {
    const res = await request(app)
      .post(`/api/students/${studentId}/licensure-results`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ programId: 999999, examName: "NCLEX-PN", result: "SCHEDULED" });
    expect(res.status).toBe(400);
  });

  it("auto-assigns attemptNumber 2 for a second attempt at the same program", async () => {
    const res = await request(app)
      .post(`/api/students/${studentId}/licensure-results`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ programId, examName: "NCLEX-PN", result: "FAILED", examDate: "2026-03-01" });

    expect(res.status).toBe(201);
    expect(res.body.data.licensureResult.attemptNumber).toBe(2);
  });

  it("lists a student's licensure results ordered by attempt", async () => {
    const res = await request(app)
      .get(`/api/students/${studentId}/licensure-results`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.licensureResults.map((r: { attemptNumber: number }) => r.attemptNumber)).toEqual([1, 2]);
  });

  it("updates a licensure result's outcome", async () => {
    const res = await request(app)
      .patch(`/api/students/${studentId}/licensure-results/${resultId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ result: "PASSED", examDate: "2026-03-01" });

    expect(res.status).toBe(200);
    expect(res.body.data.licensureResult.result).toBe("PASSED");
  });

  it("returns 404 updating a licensure result belonging to a different student", async () => {
    const otherStudent = await prisma.student.create({
      data: { institutionId, internalStudentId: "LIC-2", firstName: "Other", lastName: "Student" },
    });
    const res = await request(app)
      .patch(`/api/students/${otherStudent.id}/licensure-results/${resultId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ result: "PASSED" });
    expect(res.status).toBe(404);
  });

  it("appears in the licensure queue while awaiting a resolved result, and drops off once passed", async () => {
    await prisma.studentEnrollment.create({
      data: {
        studentId,
        programId,
        campusId,
        startDate: new Date("2025-01-01"),
        actualCompletionDate: new Date("2026-01-15"),
        enrollmentStatus: "GRADUATE_COMPLETER",
      },
    });

    // At this point the student's latest result is PASSED (from the update test above),
    // so they should NOT appear in the queue.
    const resolvedQueue = await request(app).get("/api/licensure/queue").set("Authorization", `Bearer ${adminToken}`);
    expect(resolvedQueue.status).toBe(200);
    expect(resolvedQueue.body.data.queue.some((row: { student: { id: number } }) => row.student.id === studentId)).toBe(false);

    // A fresh graduate completer with no licensure result yet should appear.
    const student2 = await prisma.student.create({
      data: { institutionId, internalStudentId: "LIC-3", firstName: "Awaiting", lastName: "Result" },
    });
    await prisma.studentEnrollment.create({
      data: {
        studentId: student2.id,
        programId,
        campusId,
        startDate: new Date("2025-01-01"),
        actualCompletionDate: new Date("2026-01-15"),
        enrollmentStatus: "GRADUATE_COMPLETER",
      },
    });

    const queueRes = await request(app).get("/api/licensure/queue").set("Authorization", `Bearer ${adminToken}`);
    expect(queueRes.status).toBe(200);
    const row = queueRes.body.data.queue.find((r: { student: { id: number } }) => r.student.id === student2.id);
    expect(row).toBeDefined();
    expect(row.latestResult).toBeNull();
  });
});
