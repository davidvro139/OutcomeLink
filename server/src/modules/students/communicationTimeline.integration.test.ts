import request from "supertest";
import { createApp } from "../../app";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";

const app = createApp();

/** Phase 2 P13 (docs/TODO.md): write-side wiring for CommunicationEvent + the timeline read endpoint. */
describe("communication timeline (integration)", () => {
  let institutionId: number;
  let studentId: number;
  let studentB: number;
  let employerId: number;
  let adminToken: string;
  let otherInstitutionAdminToken: string;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Timeline Test Institution" } });
    institutionId = institution.id;
    const otherInstitution = await prisma.institution.create({ data: { name: "Other Timeline Institution" } });

    studentId = await prisma.student
      .create({ data: { institutionId, internalStudentId: "TL-1", firstName: "Grace", lastName: "Timeline" } })
      .then((s) => s.id);
    studentB = await prisma.student
      .create({ data: { institutionId, internalStudentId: "TL-2", firstName: "Bo", lastName: "Second" } })
      .then((s) => s.id);

    const employer = await prisma.employer.create({ data: { institutionId, name: "Timeline Employer Inc" } });
    employerId = employer.id;
    await prisma.employmentRecord.create({
      data: {
        studentId,
        employerId,
        jobTitle: "Technician",
        startDate: new Date("2026-01-15"),
        fullTime: true,
        relatedToTraining: true,
        employmentStatus: "EMPLOYED",
      },
    });

    const passwordHash = await hashPassword("password123");
    await prisma.user.create({
      data: { institutionId, name: "Admin", email: "admin@timeline-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    await prisma.user.create({
      data: { institutionId: otherInstitution.id, name: "Other Admin", email: "admin@other-timeline-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });

    adminToken = (await request(app).post("/api/auth/login").send({ email: "admin@timeline-test.edu", password: "password123" })).body.data.accessToken;
    otherInstitutionAdminToken = (await request(app).post("/api/auth/login").send({ email: "admin@other-timeline-test.edu", password: "password123" })).body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects a request for a student in a different institution", async () => {
    const res = await request(app)
      .get(`/api/students/${studentId}/communication-timeline`)
      .set("Authorization", `Bearer ${otherInstitutionAdminToken}`);
    expect(res.status).toBe(404);
  });

  it("starts with an empty timeline", async () => {
    const res = await request(app)
      .get(`/api/students/${studentId}/communication-timeline`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.events).toEqual([]);
  });

  it("records a FOLLOW_UP_ATTEMPT event when a single attempt is logged", async () => {
    const res = await request(app)
      .post(`/api/followups/students/${studentId}/follow-ups`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ attemptedAt: "2026-01-10T10:00:00Z", method: "PHONE", outcome: "NO_RESPONSE" });
    expect(res.status).toBe(201);

    const timeline = await request(app)
      .get(`/api/students/${studentId}/communication-timeline`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(timeline.body.data.events).toHaveLength(1);
    expect(timeline.body.data.events[0]).toMatchObject({
      eventType: "FOLLOW_UP_ATTEMPT",
      sourceId: res.body.data.followUpAttempt.id,
    });
    expect(timeline.body.data.events[0].summaryText).toMatch(/PHONE.*NO RESPONSE/i);
  });

  it("records one event per student when bulk-logging follow-ups", async () => {
    const res = await request(app)
      .post("/api/followups/bulk")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        studentIds: [studentId, studentB],
        attemptedAt: "2026-01-12T10:00:00Z",
        method: "EMAIL",
        outcome: "STUDENT_CONTACTED",
      });
    expect(res.status).toBe(201);
    expect(res.body.data.createdCount).toBe(2);

    const [timelineA, timelineB] = await Promise.all([
      request(app).get(`/api/students/${studentId}/communication-timeline`).set("Authorization", `Bearer ${adminToken}`),
      request(app).get(`/api/students/${studentB}/communication-timeline`).set("Authorization", `Bearer ${adminToken}`),
    ]);
    expect(timelineA.body.data.events).toHaveLength(2);
    expect(timelineB.body.data.events).toHaveLength(1);
    expect(timelineB.body.data.events[0]).toMatchObject({ eventType: "FOLLOW_UP_ATTEMPT" });
  });

  it("records GRADUATE_SURVEY_SENT and GRADUATE_SURVEY_RESPONSE as distinct, correctly-ordered events", async () => {
    const sendRes = await request(app)
      .post(`/api/students/${studentId}/graduate-surveys`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ channel: "EMAIL" });
    const token = sendRes.body.data.survey.responseToken;

    await request(app).post(`/api/public/surveys/graduate/${token}/response`).send({ satisfactionRating: 5 });

    const timeline = await request(app)
      .get(`/api/students/${studentId}/communication-timeline`)
      .set("Authorization", `Bearer ${adminToken}`);

    const surveyEvents = timeline.body.data.events.filter((e: { eventType: string }) =>
      e.eventType.startsWith("GRADUATE_SURVEY"),
    );
    expect(surveyEvents.map((e: { eventType: string }) => e.eventType)).toEqual([
      "GRADUATE_SURVEY_RESPONSE",
      "GRADUATE_SURVEY_SENT",
    ]);
  });

  it("records EMPLOYER_SURVEY_SENT and EMPLOYER_SURVEY_RESPONSE as distinct events", async () => {
    const sendRes = await request(app)
      .post(`/api/students/${studentId}/employer-surveys`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ employerId });
    const token = sendRes.body.data.survey.responseToken;

    await request(app)
      .post(`/api/public/surveys/employer/${token}/response`)
      .send({ employmentVerification: "CONFIRMED" });

    const timeline = await request(app)
      .get(`/api/students/${studentId}/communication-timeline`)
      .set("Authorization", `Bearer ${adminToken}`);

    const employerEvents = timeline.body.data.events.filter((e: { eventType: string }) =>
      e.eventType.startsWith("EMPLOYER_SURVEY"),
    );
    expect(employerEvents.map((e: { eventType: string }) => e.eventType).sort()).toEqual([
      "EMPLOYER_SURVEY_RESPONSE",
      "EMPLOYER_SURVEY_SENT",
    ]);

    const total = await request(app)
      .get(`/api/students/${studentId}/communication-timeline`)
      .set("Authorization", `Bearer ${adminToken}`);
    // 1 single follow-up + 1 bulk follow-up + 2 graduate survey events + 2 employer survey events
    expect(total.body.data.events).toHaveLength(6);
  });
});
