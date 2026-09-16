import request from "supertest";
import { createApp } from "../../app";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";

const app = createApp();

describe("improvement plans (integration)", () => {
  let institutionId: number;
  let campusId: number;
  let programId: number;
  let reportingPeriodId: number;
  let responsibleUserId: number;
  let adminToken: string;
  let auditorToken: string;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Improvement Plan Test Institution" } });
    institutionId = institution.id;

    const campus = await prisma.campus.create({ data: { institutionId, name: "Main Campus" } });
    campusId = campus.id;

    const program = await prisma.program.create({
      data: { institutionId, campusId, name: "Plumbing Technology", code: "PLB-100", credentialType: "Certificate" },
    });
    programId = program.id;

    const passwordHash = await hashPassword("password123");
    await prisma.user.create({
      data: { institutionId, name: "Admin", email: "admin@improvement-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    const programAdmin = await prisma.user.create({
      data: { institutionId, name: "Program Admin", email: "progadmin@improvement-test.edu", passwordHash, role: "PROGRAM_ADMINISTRATOR" },
    });
    responsibleUserId = programAdmin.id;
    await prisma.user.create({
      data: { institutionId, name: "Auditor", email: "auditor@improvement-test.edu", passwordHash, role: "READ_ONLY_AUDITOR" },
    });

    const adminLogin = await request(app).post("/api/auth/login").send({ email: "admin@improvement-test.edu", password: "password123" });
    adminToken = adminLogin.body.data.accessToken;
    const auditorLogin = await request(app).post("/api/auth/login").send({ email: "auditor@improvement-test.edu", password: "password123" });
    auditorToken = auditorLogin.body.data.accessToken;

    const framework = await prisma.accreditationFramework.create({ data: { name: "COE-IMPROVEMENT-TEST" } });
    const ruleSet = await prisma.ruleSet.create({
      data: {
        frameworkId: framework.id,
        versionLabel: "COE-2026-IMPROVEMENT-TEST",
        effectiveStartDate: new Date("2025-01-01"),
        ruleDefinition: { benchmarks: { completion: 60, placement: 70, licensure: 70 } },
      },
    });
    const period = await prisma.reportingPeriod.create({
      data: { institutionId, ruleSetId: ruleSet.id, label: "IMPROVEMENT-TEST-PERIOD", startDate: new Date("2025-07-01"), endDate: new Date("2026-06-30") },
    });
    reportingPeriodId = period.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects creating a plan without authentication", async () => {
    const res = await request(app)
      .post("/api/accreditation/improvement-plans")
      .send({ programId, metric: "PLACEMENT", reportingPeriodId, responsibleUserId });
    expect(res.status).toBe(401);
  });

  it("rejects creating a plan as a read-only auditor", async () => {
    const res = await request(app)
      .post("/api/accreditation/improvement-plans")
      .set("Authorization", `Bearer ${auditorToken}`)
      .send({ programId, metric: "PLACEMENT", reportingPeriodId, responsibleUserId });
    expect(res.status).toBe(403);
  });

  it("rejects an unknown responsibleUserId", async () => {
    const res = await request(app)
      .post("/api/accreditation/improvement-plans")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ programId, metric: "PLACEMENT", reportingPeriodId, responsibleUserId: 999999 });
    expect(res.status).toBe(400);
  });

  let planId: number;

  it("creates an improvement plan", async () => {
    const res = await request(app)
      .post("/api/accreditation/improvement-plans")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        programId,
        metric: "PLACEMENT",
        reportingPeriodId,
        currentResult: 65,
        target: 70,
        problemDescription: "Placement rate fell below the 70% benchmark this period.",
        rootCause: "Career services follow-up backlog during peak enrollment.",
        responsibleUserId,
        dueDate: "2026-06-01",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.improvementPlan).toMatchObject({
      programId,
      metric: "PLACEMENT",
      status: "DRAFT",
    });
    expect(res.body.data.improvementPlan.responsibleUser.name).toBe("Program Admin");
    planId = res.body.data.improvementPlan.id;
  });

  it("lists plans filtered by reporting period", async () => {
    const res = await request(app)
      .get(`/api/accreditation/improvement-plans?reportingPeriodId=${reportingPeriodId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.improvementPlans.map((p: { id: number }) => p.id)).toContain(planId);
  });

  it("moves a plan from DRAFT to ACTIVE", async () => {
    const res = await request(app)
      .patch(`/api/accreditation/improvement-plans/${planId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "ACTIVE" });
    expect(res.status).toBe(200);
    expect(res.body.data.improvementPlan.status).toBe("ACTIVE");
  });

  it("adds a progress update to the plan", async () => {
    const res = await request(app)
      .post(`/api/accreditation/improvement-plans/${planId}/updates`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        updateText: "Hired an additional career services coordinator.",
        correctiveAction: "Weekly follow-up cadence increased from monthly.",
      });
    expect(res.status).toBe(201);
    expect(res.body.data.update).toMatchObject({
      improvementPlanId: planId,
      createdBy: "Admin",
    });
  });

  it("shows the plan with its update in reverse-chronological order", async () => {
    const res = await request(app)
      .get(`/api/accreditation/improvement-plans/${planId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.improvementPlan.updates).toHaveLength(1);
    expect(res.body.data.improvementPlan.updates[0].updateText).toContain("career services coordinator");
  });

  it("returns 404 for a plan belonging to a different institution", async () => {
    const otherInstitution = await prisma.institution.create({ data: { name: "Other Improvement Institution" } });
    const otherCampus = await prisma.campus.create({ data: { institutionId: otherInstitution.id, name: "Campus" } });
    const otherProgram = await prisma.program.create({
      data: { institutionId: otherInstitution.id, campusId: otherCampus.id, name: "Other", code: "OTH-1", credentialType: "Diploma" },
    });
    const otherRuleSet = await prisma.ruleSet.create({
      data: {
        frameworkId: (await prisma.accreditationFramework.create({ data: { name: "OTHER-FRAMEWORK" } })).id,
        versionLabel: "OTHER-V1",
        effectiveStartDate: new Date("2025-01-01"),
        ruleDefinition: { benchmarks: { completion: 60, placement: 70, licensure: 70 } },
      },
    });
    const otherPeriod = await prisma.reportingPeriod.create({
      data: { institutionId: otherInstitution.id, ruleSetId: otherRuleSet.id, label: "OTHER-PERIOD", startDate: new Date("2025-01-01"), endDate: new Date("2025-12-31") },
    });
    const otherUser = await prisma.user.create({
      data: { institutionId: otherInstitution.id, name: "Other Admin", email: "other@improvement-test.edu", passwordHash: await hashPassword("password123"), role: "SYSTEM_ADMINISTRATOR" },
    });
    const otherPlan = await prisma.improvementPlan.create({
      data: { programId: otherProgram.id, metric: "COMPLETION", reportingPeriodId: otherPeriod.id, responsibleUserId: otherUser.id },
    });

    const res = await request(app)
      .get(`/api/accreditation/improvement-plans/${otherPlan.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});
