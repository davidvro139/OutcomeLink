import request from "supertest";
import { createApp } from "../../app";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import { runFollowUpAutoAssignment } from "./assignment";

const app = createApp();

describe("follow-up assignment (integration)", () => {
  let institutionId: number;
  let otherInstitutionId: number;
  let campusId: number;
  let programId: number;
  let adminToken: string;
  let careerServicesToken: string;
  let auditorToken: string;
  let staffId: number;
  let otherStaffId: number;
  let otherInstitutionStudentId: number;
  let studentId: number;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Assignment Test Institution" } });
    institutionId = institution.id;
    const otherInstitution = await prisma.institution.create({ data: { name: "Other Assignment Institution" } });
    otherInstitutionId = otherInstitution.id;

    const campus = await prisma.campus.create({ data: { institutionId, name: "Main Campus" } });
    campusId = campus.id;
    const program = await prisma.program.create({
      data: { institutionId, campusId, name: "Automotive Technology", code: "FA-AUTO", credentialType: "Diploma" },
    });
    programId = program.id;

    const passwordHash = await hashPassword("password123");
    await prisma.user.create({
      data: { institutionId, name: "Admin", email: "admin@assignment-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    const careerServices = await prisma.user.create({
      data: { institutionId, name: "Career Services", email: "careerservices@assignment-test.edu", passwordHash, role: "CAREER_SERVICES_STAFF" },
    });
    staffId = careerServices.id;
    const otherStaff = await prisma.user.create({
      data: { institutionId, name: "Other Staff", email: "otherstaff@assignment-test.edu", passwordHash, role: "INSTRUCTOR_STAFF" },
    });
    otherStaffId = otherStaff.id;
    await prisma.user.create({
      data: { institutionId, name: "Auditor", email: "auditor@assignment-test.edu", passwordHash, role: "READ_ONLY_AUDITOR" },
    });

    adminToken = (await request(app).post("/api/auth/login").send({ email: "admin@assignment-test.edu", password: "password123" })).body.data.accessToken;
    careerServicesToken = (await request(app).post("/api/auth/login").send({ email: "careerservices@assignment-test.edu", password: "password123" })).body.data.accessToken;
    auditorToken = (await request(app).post("/api/auth/login").send({ email: "auditor@assignment-test.edu", password: "password123" })).body.data.accessToken;

    const student = await prisma.student.create({
      data: { institutionId, internalStudentId: "FA-STU-1", firstName: "Fa", lastName: "Student" },
    });
    studentId = student.id;
    await prisma.studentEnrollment.create({
      data: { studentId, programId, campusId, startDate: new Date("2025-01-01"), enrollmentStatus: "ACTIVE" },
    });

    const otherStudent = await prisma.student.create({
      data: { institutionId: otherInstitutionId, internalStudentId: "FA-OTHER-1", firstName: "Other", lastName: "Student" },
    });
    otherInstitutionStudentId = otherStudent.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("program follow-up owner CRUD", () => {
    it("rejects a non-admin role", async () => {
      const res = await request(app)
        .get(`/api/programs/${programId}/follow-up-owner`)
        .set("Authorization", `Bearer ${careerServicesToken}`);
      expect(res.status).toBe(403);
    });

    it("shows no owner initially, then sets, updates, and clears one", async () => {
      const empty = await request(app).get(`/api/programs/${programId}/follow-up-owner`).set("Authorization", `Bearer ${adminToken}`);
      expect(empty.body.data.owner).toBeNull();

      const set = await request(app)
        .put(`/api/programs/${programId}/follow-up-owner`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ staffUserId: staffId });
      expect(set.status).toBe(200);
      expect(set.body.data.owner).toMatchObject({ staffUser: { id: staffId } });

      const updated = await request(app)
        .put(`/api/programs/${programId}/follow-up-owner`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ staffUserId: otherStaffId });
      expect(updated.body.data.owner).toMatchObject({ staffUser: { id: otherStaffId } });

      const removed = await request(app).delete(`/api/programs/${programId}/follow-up-owner`).set("Authorization", `Bearer ${adminToken}`);
      expect(removed.status).toBe(200);
      const afterRemove = await request(app).get(`/api/programs/${programId}/follow-up-owner`).set("Authorization", `Bearer ${adminToken}`);
      expect(afterRemove.body.data.owner).toBeNull();
    });

    it("rejects an unknown staffUserId", async () => {
      const res = await request(app)
        .put(`/api/programs/${programId}/follow-up-owner`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ staffUserId: 999999 });
      expect(res.status).toBe(400);
    });
  });

  describe("manual assign", () => {
    afterEach(async () => {
      await prisma.student.update({ where: { id: studentId }, data: { assignedStaffUserId: null } });
    });

    it("rejects a Read-Only Auditor", async () => {
      const res = await request(app)
        .patch(`/api/followups/${studentId}/assign`)
        .set("Authorization", `Bearer ${auditorToken}`)
        .send({ staffUserId: staffId });
      expect(res.status).toBe(403);
    });

    it("assigns and clears a student", async () => {
      const assigned = await request(app)
        .patch(`/api/followups/${studentId}/assign`)
        .set("Authorization", `Bearer ${careerServicesToken}`)
        .send({ staffUserId: staffId });
      expect(assigned.status).toBe(200);
      expect(assigned.body.data.student.assignedStaffUser).toMatchObject({ id: staffId });

      const cleared = await request(app)
        .patch(`/api/followups/${studentId}/assign`)
        .set("Authorization", `Bearer ${careerServicesToken}`)
        .send({ staffUserId: null });
      expect(cleared.body.data.student.assignedStaffUserId).toBeNull();
    });

    it("rejects an unknown staffUserId", async () => {
      const res = await request(app)
        .patch(`/api/followups/${studentId}/assign`)
        .set("Authorization", `Bearer ${careerServicesToken}`)
        .send({ staffUserId: 999999 });
      expect(res.status).toBe(400);
    });

    it("does not leak another institution's student", async () => {
      const res = await request(app)
        .patch(`/api/followups/${otherInstitutionStudentId}/assign`)
        .set("Authorization", `Bearer ${careerServicesToken}`)
        .send({ staffUserId: staffId });
      expect(res.status).toBe(404);
    });

    it("reflects the real assignment in the queue, overriding the derived last-attempt owner", async () => {
      await prisma.followUpAttempt.create({
        data: { studentId, staffUserId: otherStaffId, attemptedAt: new Date(), method: "PHONE", outcome: "NO_RESPONSE" },
      });
      const beforeAssign = await request(app).get("/api/followups/queue").set("Authorization", `Bearer ${adminToken}`);
      const beforeRow = beforeAssign.body.data.find((r: { student: { id: number } }) => r.student.id === studentId);
      expect(beforeRow.assignedTo).toMatchObject({ id: otherStaffId });

      await request(app).patch(`/api/followups/${studentId}/assign`).set("Authorization", `Bearer ${adminToken}`).send({ staffUserId: staffId });
      const afterAssign = await request(app).get("/api/followups/queue").set("Authorization", `Bearer ${adminToken}`);
      const afterRow = afterAssign.body.data.find((r: { student: { id: number } }) => r.student.id === studentId);
      expect(afterRow.assignedTo).toMatchObject({ id: staffId });
    });
  });

  describe("bulk assign", () => {
    it("assigns eligible students and skips ones outside the caller's institution", async () => {
      const res = await request(app)
        .post("/api/followups/assign/bulk")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ studentIds: [studentId, otherInstitutionStudentId], staffUserId: staffId });
      expect(res.status).toBe(200);
      expect(res.body.data.assignedCount).toBe(1);
      expect(res.body.data.skipped).toEqual([{ studentId: otherInstitutionStudentId, reason: "Student not found" }]);

      const updated = await prisma.student.findUnique({ where: { id: studentId } });
      expect(updated!.assignedStaffUserId).toBe(staffId);
      await prisma.student.update({ where: { id: studentId }, data: { assignedStaffUserId: null } });
    });
  });

  describe("runFollowUpAutoAssignment", () => {
    let unresolvedStudentId: number;
    let reportingPeriodId: number;

    beforeAll(async () => {
      const framework = await prisma.accreditationFramework.create({ data: { name: "COE-ASSIGN-TEST" } });
      const ruleSet = await prisma.ruleSet.create({
        data: {
          frameworkId: framework.id,
          versionLabel: "COE-2026-ASSIGN-TEST",
          effectiveStartDate: new Date("2025-01-01"),
          ruleDefinition: { benchmarks: { completion: 60, placement: 70, licensure: 70 } },
        },
      });
      const period = await prisma.reportingPeriod.create({
        data: { institutionId, ruleSetId: ruleSet.id, label: "FA-AUTO-PERIOD", startDate: new Date("2025-07-01"), endDate: new Date("2026-06-30"), status: "OPEN" },
      });
      reportingPeriodId = period.id;

      const student = await prisma.student.create({
        data: { institutionId, internalStudentId: "FA-UNRESOLVED-1", firstName: "Unresolved", lastName: "Grad" },
      });
      unresolvedStudentId = student.id;
      const enrollment = await prisma.studentEnrollment.create({
        data: { studentId: unresolvedStudentId, programId, campusId, startDate: new Date("2025-01-01"), actualCompletionDate: new Date("2026-01-01"), enrollmentStatus: "GRADUATE_COMPLETER" },
      });
      await prisma.studentClassification.create({
        data: {
          studentEnrollmentId: enrollment.id,
          reportingPeriodId,
          metric: "PLACEMENT",
          classificationCode: "SEEKING_OR_UNKNOWN",
          determinedByRuleSetId: ruleSet.id,
        },
      });
    });

    afterEach(async () => {
      await prisma.student.update({ where: { id: unresolvedStudentId }, data: { assignedStaffUserId: null } });
      await prisma.notification.deleteMany({ where: { userId: { in: [staffId, otherStaffId] }, type: "FOLLOW_UP_DUE" } });
    });

    it("skips students in a program with no configured owner", async () => {
      const result = await runFollowUpAutoAssignment();
      expect(result.assignedCount).toBe(0);
      const student = await prisma.student.findUnique({ where: { id: unresolvedStudentId } });
      expect(student!.assignedStaffUserId).toBeNull();
    });

    it("assigns an unresolved student to the program's configured owner and sends one digest notification", async () => {
      await prisma.programFollowUpOwner.upsert({
        where: { programId },
        create: { institutionId, programId, staffUserId: staffId },
        update: { staffUserId: staffId },
      });

      const result = await runFollowUpAutoAssignment();
      expect(result.assignedCount).toBe(1);
      expect(result.ownersNotified).toBe(1);

      const student = await prisma.student.findUnique({ where: { id: unresolvedStudentId } });
      expect(student!.assignedStaffUserId).toBe(staffId);

      const notifications = await prisma.notification.findMany({ where: { userId: staffId, type: "FOLLOW_UP_DUE" } });
      expect(notifications).toHaveLength(1);
      expect(notifications[0]!.message).toContain("1 student");

      await prisma.programFollowUpOwner.deleteMany({ where: { programId } });
    });

    it("does not reassign or re-notify a student who already has an assignment", async () => {
      await prisma.programFollowUpOwner.upsert({
        where: { programId },
        create: { institutionId, programId, staffUserId: staffId },
        update: { staffUserId: staffId },
      });
      await prisma.student.update({ where: { id: unresolvedStudentId }, data: { assignedStaffUserId: otherStaffId } });

      const result = await runFollowUpAutoAssignment();
      expect(result.assignedCount).toBe(0);
      const student = await prisma.student.findUnique({ where: { id: unresolvedStudentId } });
      expect(student!.assignedStaffUserId).toBe(otherStaffId);

      await prisma.programFollowUpOwner.deleteMany({ where: { programId } });
    });
  });

  describe("automation run-now", () => {
    it("rejects a non-admin role", async () => {
      const res = await request(app).post("/api/followups/automation/run-now").set("Authorization", `Bearer ${careerServicesToken}`);
      expect(res.status).toBe(403);
    });

    it("runs successfully for an admin", async () => {
      const res = await request(app).post("/api/followups/automation/run-now").set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty("assignedCount");
      expect(res.body.data).toHaveProperty("escalatedCount");
    });
  });
});
