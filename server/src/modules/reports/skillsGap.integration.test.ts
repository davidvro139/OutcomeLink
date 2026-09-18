import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../../app";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";

const app = createApp();

/**
 * Skills-Gap Analysis (Phase 3, spec §64): compares employer-rated skill
 * dimensions per program against the institution-wide average, attributing
 * each response to the student's most recently completed enrollment.
 */
describe("skills-gap analysis report (integration)", () => {
  let institutionId: number;
  let otherInstitutionId: number;
  let autoProgramId: number;
  let nursingProgramId: number;
  let adminToken: string;
  let otherAdminToken: string;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Skills Gap Test Institution" } });
    institutionId = institution.id;
    const otherInstitution = await prisma.institution.create({ data: { name: "Other Skills Gap Institution" } });
    otherInstitutionId = otherInstitution.id;

    const campus = await prisma.campus.create({ data: { institutionId, name: "Main Campus" } });
    const autoProgram = await prisma.program.create({
      data: { institutionId, campusId: campus.id, name: "Automotive Technology", code: "SKILLS-AUTO", credentialType: "Diploma" },
    });
    autoProgramId = autoProgram.id;
    const nursingProgram = await prisma.program.create({
      data: { institutionId, campusId: campus.id, name: "Practical Nursing", code: "SKILLS-NURSE", credentialType: "Diploma" },
    });
    nursingProgramId = nursingProgram.id;

    const employer = await prisma.employer.create({ data: { institutionId, name: "Skills Gap Employer Inc" } });

    const passwordHash = await hashPassword("password123");
    await prisma.user.create({
      data: { institutionId, name: "Admin", email: "admin@skills-gap-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    await prisma.user.create({
      data: { institutionId: otherInstitutionId, name: "Other Admin", email: "admin@other-skills-gap-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    adminToken = (await request(app).post("/api/auth/login").send({ email: "admin@skills-gap-test.edu", password: "password123" })).body.data.accessToken;
    otherAdminToken = (await request(app).post("/api/auth/login").send({ email: "admin@other-skills-gap-test.edu", password: "password123" })).body.data.accessToken;

    async function makeCompletedStudent(label: string, programId: number) {
      const student = await prisma.student.create({
        data: { institutionId, internalStudentId: `SKILLS-${label}`, firstName: label, lastName: "Student" },
      });
      await prisma.studentEnrollment.create({
        data: {
          studentId: student.id,
          programId,
          campusId: campus.id,
          startDate: new Date("2025-01-01"),
          actualCompletionDate: new Date("2026-01-01"),
          enrollmentStatus: "GRADUATE_COMPLETER",
        },
      });
      return student;
    }

    async function surveyResponse(
      studentId: number,
      ratings: { technicalPreparednessRating: number; communicationRating: number; problemSolvingRating: number; professionalismRating: number },
      skillsGapNotes?: string,
    ) {
      const survey = await prisma.employerSurvey.create({
        data: { studentId, employerId: employer.id, sentAt: new Date(), responseToken: randomUUID() },
      });
      await prisma.employerSurveyResponse.create({
        data: { surveyId: survey.id, ...ratings, skillsGapNotes, submittedAt: new Date() },
      });
    }

    // Automotive Technology: low technical ratings (2 responses, avg technical = 3).
    const auto1 = await makeCompletedStudent("Auto1", autoProgramId);
    await surveyResponse(
      auto1.id,
      { technicalPreparednessRating: 3, communicationRating: 4, problemSolvingRating: 4, professionalismRating: 4 },
      "Could use more hands-on diagnostic experience before graduating.",
    );
    const auto2 = await makeCompletedStudent("Auto2", autoProgramId);
    await surveyResponse(auto2.id, { technicalPreparednessRating: 3, communicationRating: 4, problemSolvingRating: 4, professionalismRating: 4 });

    // Nursing: high technical ratings (2 responses, avg technical = 5).
    const nurse1 = await makeCompletedStudent("Nurse1", nursingProgramId);
    await surveyResponse(nurse1.id, { technicalPreparednessRating: 5, communicationRating: 4, problemSolvingRating: 4, professionalismRating: 4 });
    const nurse2 = await makeCompletedStudent("Nurse2", nursingProgramId);
    await surveyResponse(nurse2.id, { technicalPreparednessRating: 5, communicationRating: 4, problemSolvingRating: 4, professionalismRating: 4 });

    // A student with no completed enrollment on file -- counts institution-wide, not attributable to any program.
    const noProgramStudent = await prisma.student.create({
      data: { institutionId, internalStudentId: "SKILLS-NoProgram", firstName: "NoProgram", lastName: "Student" },
    });
    await surveyResponse(noProgramStudent.id, { technicalPreparednessRating: 1, communicationRating: 1, problemSolvingRating: 1, professionalismRating: 1 });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects without authentication", async () => {
    const res = await request(app).get("/api/reports/skills-gap");
    expect(res.status).toBe(401);
  });

  it("computes institution-wide averages including the response with no attributable program", async () => {
    const res = await request(app).get("/api/reports/skills-gap").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totalResponses).toBe(5);
    // technical: (3+3+5+5+1)/5 = 3.4
    expect(res.body.data.institutionAverages.technicalPreparednessRating).toBeCloseTo(3.4, 5);
  });

  it("attributes each response to the student's most recently completed program and computes per-program gaps", async () => {
    const res = await request(app).get("/api/reports/skills-gap").set("Authorization", `Bearer ${adminToken}`);
    const autoRow = res.body.data.byProgram.find((r: { program: { id: number } }) => r.program.id === autoProgramId);
    const nursingRow = res.body.data.byProgram.find((r: { program: { id: number } }) => r.program.id === nursingProgramId);

    expect(autoRow.responseCount).toBe(2);
    expect(autoRow.averages.technicalPreparednessRating).toBeCloseTo(3, 5);
    // gap = institutionAvg(3.4) - programAvg(3) = 0.4 (positive = below average)
    expect(autoRow.gaps.technicalPreparednessRating).toBeCloseTo(0.4, 5);

    expect(nursingRow.responseCount).toBe(2);
    expect(nursingRow.averages.technicalPreparednessRating).toBeCloseTo(5, 5);
    // gap = 3.4 - 5 = -1.6 (negative = above average)
    expect(nursingRow.gaps.technicalPreparednessRating).toBeCloseTo(-1.6, 5);
  });

  it("sorts the worst-gap program first", async () => {
    const res = await request(app).get("/api/reports/skills-gap").set("Authorization", `Bearer ${adminToken}`);
    const programIdsInOrder = res.body.data.byProgram.map((r: { program: { id: number } }) => r.program.id);
    expect(programIdsInOrder.indexOf(autoProgramId)).toBeLessThan(programIdsInOrder.indexOf(nursingProgramId));
  });

  it("surfaces the free-text skills-gap note under the right program", async () => {
    const res = await request(app).get("/api/reports/skills-gap").set("Authorization", `Bearer ${adminToken}`);
    const autoRow = res.body.data.byProgram.find((r: { program: { id: number } }) => r.program.id === autoProgramId);
    expect(autoRow.skillsGapNotes).toHaveLength(1);
    expect(autoRow.skillsGapNotes[0]).toMatchObject({
      employerName: "Skills Gap Employer Inc",
      note: "Could use more hands-on diagnostic experience before graduating.",
    });

    const nursingRow = res.body.data.byProgram.find((r: { program: { id: number } }) => r.program.id === nursingProgramId);
    expect(nursingRow.skillsGapNotes).toHaveLength(0);
  });

  it("does not leak another institution's data into the averages", async () => {
    const res = await request(app).get("/api/reports/skills-gap").set("Authorization", `Bearer ${otherAdminToken}`);
    expect(res.body.data.totalResponses).toBe(0);
    expect(res.body.data.byProgram).toEqual([]);
  });
});
