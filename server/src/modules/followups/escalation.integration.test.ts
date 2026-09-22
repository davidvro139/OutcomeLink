import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import { runFollowUpEscalation } from "./escalation";

describe("runFollowUpEscalation (integration)", () => {
  let institutionId: number;
  let campusId: number;
  let programId: number;
  let assigneeId: number;
  let programAdminId: number;
  let studentId: number;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Escalation Test Institution" } });
    institutionId = institution.id;
    const campus = await prisma.campus.create({ data: { institutionId, name: "Main Campus" } });
    campusId = campus.id;
    const program = await prisma.program.create({
      data: { institutionId, campusId, name: "Automotive Technology", code: "ESC-AUTO", credentialType: "Diploma" },
    });
    programId = program.id;

    const passwordHash = await hashPassword("password123");
    const assignee = await prisma.user.create({
      data: { institutionId, name: "Assignee", email: "assignee@escalation-test.edu", passwordHash, role: "CAREER_SERVICES_STAFF" },
    });
    assigneeId = assignee.id;
    const programAdmin = await prisma.user.create({
      data: { institutionId, name: "Program Admin", email: "programadmin@escalation-test.edu", passwordHash, role: "PROGRAM_ADMINISTRATOR" },
    });
    programAdminId = programAdmin.id;
    await prisma.userProgramAccess.create({ data: { userId: programAdminId, programId } });

    const student = await prisma.student.create({
      data: { institutionId, internalStudentId: "ESC-STU-1", firstName: "Esc", lastName: "Student" },
    });
    studentId = student.id;
    await prisma.studentEnrollment.create({
      data: {
        studentId,
        programId,
        campusId,
        startDate: new Date("2025-01-01"),
        actualCompletionDate: new Date("2026-01-01"),
        enrollmentStatus: "GRADUATE_COMPLETER",
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: [assigneeId, programAdminId] } } });
    await prisma.followUpAttempt.deleteMany({ where: { studentId } });
    await prisma.student.update({ where: { id: studentId }, data: { assignedStaffUserId: null } });
  });

  it("does nothing for an unassigned student even if overdue", async () => {
    await prisma.followUpAttempt.create({
      data: {
        studentId,
        staffUserId: assigneeId,
        attemptedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
        method: "PHONE",
        outcome: "FOLLOW_UP_REQUIRED",
        nextFollowUpDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      },
    });
    const result = await runFollowUpEscalation();
    expect(result.escalatedCount).toBe(0);
  });

  it("does nothing for an assigned student with no nextFollowUpDate", async () => {
    await prisma.student.update({ where: { id: studentId }, data: { assignedStaffUserId: assigneeId } });
    const result = await runFollowUpEscalation();
    expect(result.escalatedCount).toBe(0);
  });

  it("does nothing for an assigned student not yet overdue past the threshold", async () => {
    await prisma.student.update({ where: { id: studentId }, data: { assignedStaffUserId: assigneeId } });
    await prisma.followUpAttempt.create({
      data: {
        studentId,
        staffUserId: assigneeId,
        attemptedAt: new Date(),
        method: "EMAIL",
        outcome: "FOLLOW_UP_REQUIRED",
        nextFollowUpDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
    });
    const result = await runFollowUpEscalation();
    expect(result.escalatedCount).toBe(0);
  });

  it("notifies the assignee and program admin when overdue past 14 days, without reassigning", async () => {
    await prisma.student.update({ where: { id: studentId }, data: { assignedStaffUserId: assigneeId } });
    await prisma.followUpAttempt.create({
      data: {
        studentId,
        staffUserId: assigneeId,
        attemptedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
        method: "PHONE",
        outcome: "FOLLOW_UP_REQUIRED",
        nextFollowUpDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      },
    });

    const result = await runFollowUpEscalation();
    expect(result.escalatedCount).toBe(1);

    const student = await prisma.student.findUnique({ where: { id: studentId } });
    expect(student!.assignedStaffUserId).toBe(assigneeId);

    const assigneeNotifications = await prisma.notification.findMany({ where: { userId: assigneeId, type: "FOLLOW_UP_OVERDUE" } });
    expect(assigneeNotifications).toHaveLength(1);
    expect(assigneeNotifications[0]!.message).toContain("Esc Student");
    const adminNotifications = await prisma.notification.findMany({ where: { userId: programAdminId, type: "FOLLOW_UP_OVERDUE" } });
    expect(adminNotifications).toHaveLength(1);
  });

  it("does not re-notify within the throttle window on a second run", async () => {
    await prisma.student.update({ where: { id: studentId }, data: { assignedStaffUserId: assigneeId } });
    await prisma.followUpAttempt.create({
      data: {
        studentId,
        staffUserId: assigneeId,
        attemptedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
        method: "PHONE",
        outcome: "FOLLOW_UP_REQUIRED",
        nextFollowUpDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      },
    });

    const first = await runFollowUpEscalation();
    expect(first.escalatedCount).toBe(1);
    const second = await runFollowUpEscalation();
    expect(second.escalatedCount).toBe(0);

    const notifications = await prisma.notification.findMany({ where: { userId: assigneeId, type: "FOLLOW_UP_OVERDUE" } });
    expect(notifications).toHaveLength(1);
  });
});
