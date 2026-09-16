import request from "supertest";
import { createApp } from "../../app";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";

const app = createApp();

/**
 * Employer Relationship Analytics (Phase 2 P5): a deliberately concentrated
 * fixture (one employer takes 3 of 5 placements = 60% share) to confirm the
 * concentration math and risk classification are computed correctly, not
 * just that "some data" comes back — plus an industry breakdown check.
 */
describe("employer analytics (integration)", () => {
  let institutionId: number;
  let campusId: number;
  let programId: number;
  let reportingPeriodId: number;
  let adminToken: string;
  let dominantEmployerId: number;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Employer Analytics Test Institution" } });
    institutionId = institution.id;

    const campus = await prisma.campus.create({ data: { institutionId, name: "Main Campus" } });
    campusId = campus.id;

    const program = await prisma.program.create({
      data: { institutionId, campusId, name: "Automotive Technology", code: "AUTO-100", credentialType: "Diploma" },
    });
    programId = program.id;

    const passwordHash = await hashPassword("password123");
    await prisma.user.create({
      data: { institutionId, name: "Admin", email: "admin@employer-analytics-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    const adminLogin = await request(app).post("/api/auth/login").send({ email: "admin@employer-analytics-test.edu", password: "password123" });
    adminToken = adminLogin.body.data.accessToken;

    const framework = await prisma.accreditationFramework.create({ data: { name: "COE-EMPLOYER-ANALYTICS-TEST" } });
    const ruleSet = await prisma.ruleSet.create({
      data: {
        frameworkId: framework.id,
        versionLabel: "COE-2026-EMPLOYER-ANALYTICS-TEST",
        effectiveStartDate: new Date("2025-01-01"),
        ruleDefinition: { benchmarks: { completion: 60, placement: 70, licensure: 70 } },
      },
    });
    const period = await prisma.reportingPeriod.create({
      data: { institutionId, ruleSetId: ruleSet.id, label: "EMPLOYER-ANALYTICS-TEST-PERIOD", startDate: new Date("2025-07-01"), endDate: new Date("2026-06-30") },
    });
    reportingPeriodId = period.id;

    const dominantEmployer = await prisma.employer.create({
      data: { institutionId, name: "Dominant Auto Group", industry: "Automotive Repair" },
    });
    dominantEmployerId = dominantEmployer.id;
    const otherEmployer1 = await prisma.employer.create({
      data: { institutionId, name: "Small Shop A", industry: "Automotive Repair" },
    });
    const otherEmployer2 = await prisma.employer.create({
      data: { institutionId, name: "Retail Co", industry: "Retail" },
    });

    // 3 placements at the dominant employer, 1 at each other = 5 total, 60% concentration.
    const placements: Array<{ employerId: number; related: boolean }> = [
      { employerId: dominantEmployerId, related: true },
      { employerId: dominantEmployerId, related: true },
      { employerId: dominantEmployerId, related: false },
      { employerId: otherEmployer1.id, related: true },
      { employerId: otherEmployer2.id, related: true },
    ];

    for (const [i, placement] of placements.entries()) {
      const student = await prisma.student.create({
        data: { institutionId, internalStudentId: `EMP-ANALYTICS-${i}`, firstName: "Test", lastName: `Student${i}` },
      });
      const enrollment = await prisma.studentEnrollment.create({
        data: {
          studentId: student.id,
          programId,
          campusId,
          startDate: new Date("2025-01-01"),
          actualCompletionDate: new Date("2026-01-15"),
          enrollmentStatus: "GRADUATE_COMPLETER",
        },
      });
      await prisma.studentOutcomeRecord.create({
        data: {
          studentEnrollmentId: enrollment.id,
          reportingPeriodId,
          licensureRequired: false,
          employmentStatus: "EMPLOYED",
          employerId: placement.employerId,
          relatedToTraining: placement.related,
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects the analytics endpoint without authentication", async () => {
    const res = await request(app).get("/api/employers/analytics");
    expect(res.status).toBe(401);
  });

  it("ranks the dominant employer first and computes 60% top-employer concentration as HIGH risk", async () => {
    const res = await request(app)
      .get(`/api/employers/analytics?reportingPeriodId=${reportingPeriodId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.topEmployers[0]).toMatchObject({
      employer: { id: dominantEmployerId, name: "Dominant Auto Group" },
      placementCount: 3,
      relatedPlacementCount: 2,
    });
    expect(res.body.data.concentration).toMatchObject({
      totalPlacements: 5,
      distinctEmployerCount: 3,
      topEmployerShare: 60,
      top5Share: 100,
      risk: "HIGH",
    });
  });

  it("breaks placements down by industry", async () => {
    const res = await request(app)
      .get(`/api/employers/analytics?reportingPeriodId=${reportingPeriodId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const automotive = res.body.data.industryBreakdown.find((i: { industry: string }) => i.industry === "Automotive Repair");
    expect(automotive).toMatchObject({ placementCount: 4, employerCount: 2 });
    const retail = res.body.data.industryBreakdown.find((i: { industry: string }) => i.industry === "Retail");
    expect(retail).toMatchObject({ placementCount: 1, employerCount: 1 });
  });

  it("returns an empty, non-error result for a period with no placements", async () => {
    const emptyPeriod = await prisma.reportingPeriod.create({
      data: { institutionId, ruleSetId: (await prisma.reportingPeriod.findUniqueOrThrow({ where: { id: reportingPeriodId } })).ruleSetId, label: "EMPTY-PERIOD", startDate: new Date("2020-01-01"), endDate: new Date("2020-12-31") },
    });
    const res = await request(app)
      .get(`/api/employers/analytics?reportingPeriodId=${emptyPeriod.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.topEmployers).toHaveLength(0);
    expect(res.body.data.concentration).toMatchObject({ totalPlacements: 0, topEmployerShare: 0, risk: "LOW" });
  });
});
