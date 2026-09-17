import request from "supertest";
import { createApp } from "../../app";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";

const app = createApp();

describe("surveys (integration)", () => {
  let institutionId: number;
  let studentId: number;
  let employerId: number;
  let adminToken: string;
  let auditorToken: string;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Surveys Test Institution" } });
    institutionId = institution.id;

    const student = await prisma.student.create({
      data: { institutionId, internalStudentId: "SURVEY-1", firstName: "Grace", lastName: "Graduate" },
    });
    studentId = student.id;

    const employer = await prisma.employer.create({ data: { institutionId, name: "Acme Manufacturing" } });
    employerId = employer.id;

    const passwordHash = await hashPassword("password123");
    await prisma.user.create({
      data: { institutionId, name: "Admin", email: "admin@surveys-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    await prisma.user.create({
      data: { institutionId, name: "Auditor", email: "auditor@surveys-test.edu", passwordHash, role: "READ_ONLY_AUDITOR" },
    });

    const adminLogin = await request(app).post("/api/auth/login").send({ email: "admin@surveys-test.edu", password: "password123" });
    adminToken = adminLogin.body.data.accessToken;

    const auditorLogin = await request(app).post("/api/auth/login").send({ email: "auditor@surveys-test.edu", password: "password123" });
    auditorToken = auditorLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("graduate surveys", () => {
    it("rejects sending a survey without authentication", async () => {
      const res = await request(app).post(`/api/students/${studentId}/graduate-surveys`).send({});
      expect(res.status).toBe(401);
    });

    it("rejects a Read-Only Auditor from sending a survey", async () => {
      const res = await request(app)
        .post(`/api/students/${studentId}/graduate-surveys`)
        .set("Authorization", `Bearer ${auditorToken}`)
        .send({});
      expect(res.status).toBe(403);
    });

    let token: string;

    it("lets an admin send a graduate survey", async () => {
      const res = await request(app)
        .post(`/api/students/${studentId}/graduate-surveys`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ channel: "EMAIL" });

      expect(res.status).toBe(201);
      expect(res.body.data.survey).toMatchObject({ studentId, channel: "EMAIL" });
      expect(typeof res.body.data.survey.responseToken).toBe("string");
      token = res.body.data.survey.responseToken;
    });

    it("shows the survey in the student's list, not yet responded", async () => {
      const res = await request(app)
        .get(`/api/students/${studentId}/graduate-surveys`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.surveys).toHaveLength(1);
      expect(res.body.data.surveys[0].response).toBeNull();
    });

    it("404s on an unknown public token", async () => {
      const res = await request(app).get("/api/public/surveys/graduate/not-a-real-token");
      expect(res.status).toBe(404);
    });

    it("serves the public survey by token, unauthenticated, without responded yet", async () => {
      const res = await request(app).get(`/api/public/surveys/graduate/${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        studentFirstName: "Grace",
        studentLastName: "Graduate",
        alreadyResponded: false,
      });
    });

    it("rejects an out-of-range rating", async () => {
      const res = await request(app)
        .post(`/api/public/surveys/graduate/${token}/response`)
        .send({ satisfactionRating: 6 });
      expect(res.status).toBe(400);
    });

    it("accepts a public response submission, unauthenticated", async () => {
      const res = await request(app).post(`/api/public/surveys/graduate/${token}/response`).send({
        employmentStatus: "EMPLOYED",
        employer: "Acme Manufacturing",
        jobTitle: "Machinist",
        relatedToTrainingResponse: "YES",
        continuingEducation: "NOT_ENROLLED",
        satisfactionRating: 5,
        skillsPreparednessRating: 4,
        comments: "Great program",
      });
      expect(res.status).toBe(201);
      expect(res.body.data.response).toMatchObject({
        employmentStatus: "EMPLOYED",
        jobTitle: "Machinist",
        satisfactionRating: 5,
        skillsPreparednessRating: 4,
      });
    });

    it("now shows alreadyResponded on the public endpoint", async () => {
      const res = await request(app).get(`/api/public/surveys/graduate/${token}`);
      expect(res.body.data.alreadyResponded).toBe(true);
    });

    it("rejects a second response submission for the same survey", async () => {
      const res = await request(app)
        .post(`/api/public/surveys/graduate/${token}/response`)
        .send({ satisfactionRating: 3 });
      expect(res.status).toBe(409);
    });

    it("shows the response nested in the staff-facing list", async () => {
      const res = await request(app)
        .get(`/api/students/${studentId}/graduate-surveys`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.body.data.surveys[0].response).toMatchObject({ jobTitle: "Machinist", satisfactionRating: 5 });
    });
  });

  describe("employer surveys", () => {
    it("refuses to send a survey with no employment record on file", async () => {
      const res = await request(app)
        .post(`/api/students/${studentId}/employer-surveys`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ employerId });
      expect(res.status).toBe(400);
    });

    let token: string;

    it("lets an admin send an employer survey once employment is on file", async () => {
      await prisma.employmentRecord.create({
        data: {
          studentId,
          employerId,
          jobTitle: "Machinist",
          startDate: new Date("2026-01-15"),
          fullTime: true,
          relatedToTraining: true,
          employmentStatus: "EMPLOYED",
        },
      });

      const res = await request(app)
        .post(`/api/students/${studentId}/employer-surveys`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ employerId });
      expect(res.status).toBe(201);
      expect(res.body.data.survey).toMatchObject({ studentId, employerId });
      token = res.body.data.survey.responseToken;
    });

    it("serves the public employer survey with the employer's and student's names", async () => {
      const res = await request(app).get(`/api/public/surveys/employer/${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        studentFirstName: "Grace",
        studentLastName: "Graduate",
        employerName: "Acme Manufacturing",
        alreadyResponded: false,
      });
    });

    it("accepts a public employer response submission", async () => {
      const res = await request(app).post(`/api/public/surveys/employer/${token}/response`).send({
        employmentVerification: "CONFIRMED",
        technicalPreparednessRating: 4,
        communicationRating: 5,
        problemSolvingRating: 4,
        professionalismRating: 5,
        overallSatisfactionRating: 5,
        likelihoodToHireAgainRating: 5,
        skillsGapNotes: "Could use more CNC experience",
      });
      expect(res.status).toBe(201);
      expect(res.body.data.response).toMatchObject({
        employmentVerification: "CONFIRMED",
        overallSatisfactionRating: 5,
        likelihoodToHireAgainRating: 5,
      });
    });

    it("lists the employer survey with its response and employer name for staff", async () => {
      const res = await request(app)
        .get(`/api/students/${studentId}/employer-surveys`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.surveys[0]).toMatchObject({
        employer: { name: "Acme Manufacturing" },
        response: { employmentVerification: "CONFIRMED" },
      });
    });
  });
});
