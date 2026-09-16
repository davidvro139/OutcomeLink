import request from "supertest";
import { createApp } from "../../app";
import { computeReportingPeriod } from "./calculators/cplCalculator";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import { runWithRequestContext } from "../../lib/requestContext";

const app = createApp();

/**
 * Historical Trend Reporting (Phase 2 P3): two reporting periods for the
 * same program, with deliberately different completion rates, to confirm
 * the trend endpoint returns both periods in chronological order with the
 * right numbers attached to each — not just that "some data" comes back.
 */
describe("accreditation trends (integration)", () => {
  let institutionId: number;
  let campusId: number;
  let programId: number;
  let userId: number;
  let adminToken: string;
  let period1Id: number;
  let period2Id: number;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Trends Test Institution" } });
    institutionId = institution.id;

    const campus = await prisma.campus.create({ data: { institutionId, name: "Main Campus" } });
    campusId = campus.id;

    const program = await prisma.program.create({
      data: { institutionId, campusId, name: "Welding Technology", code: "WLD-100", credentialType: "Certificate" },
    });
    programId = program.id;

    const passwordHash = await hashPassword("password123");
    const admin = await prisma.user.create({
      data: { institutionId, name: "Admin", email: "admin@trends-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    userId = admin.id;
    const adminLogin = await request(app).post("/api/auth/login").send({ email: "admin@trends-test.edu", password: "password123" });
    adminToken = adminLogin.body.data.accessToken;

    const framework = await prisma.accreditationFramework.create({ data: { name: "COE-TRENDS-TEST" } });
    const ruleSet = await prisma.ruleSet.create({
      data: {
        frameworkId: framework.id,
        versionLabel: "COE-2026-TRENDS-TEST",
        effectiveStartDate: new Date("2024-01-01"),
        ruleDefinition: { benchmarks: { completion: 60, placement: 70, licensure: 70 } },
      },
    });

    const period1 = await prisma.reportingPeriod.create({
      data: { institutionId, ruleSetId: ruleSet.id, label: "2024", startDate: new Date("2024-01-01"), endDate: new Date("2024-12-31") },
    });
    period1Id = period1.id;
    const period2 = await prisma.reportingPeriod.create({
      data: { institutionId, ruleSetId: ruleSet.id, label: "2025", startDate: new Date("2025-01-01"), endDate: new Date("2025-12-31") },
    });
    period2Id = period2.id;

    // Period 1: 1 completer + 3 withdrawals = 25% completion.
    await createEnrollments(period1Id, ["GRADUATE_COMPLETER", "WITHDRAWN", "WITHDRAWN", "WITHDRAWN"], new Date("2024-06-01"));
    // Period 2: 3 completers + 1 withdrawal = 75% completion — an improving trend.
    await createEnrollments(period2Id, ["GRADUATE_COMPLETER", "GRADUATE_COMPLETER", "GRADUATE_COMPLETER", "WITHDRAWN"], new Date("2025-06-01"));

    async function createEnrollments(
      reportingPeriodId: number,
      statuses: Array<"GRADUATE_COMPLETER" | "WITHDRAWN">,
      completionDate: Date,
    ) {
      for (const [i, status] of statuses.entries()) {
        const student = await prisma.student.create({
          data: { institutionId, internalStudentId: `TREND-${reportingPeriodId}-${i}`, firstName: "Test", lastName: `Student${i}` },
        });
        await prisma.studentEnrollment.create({
          data: { studentId: student.id, programId, campusId, startDate: new Date("2023-01-01"), actualCompletionDate: completionDate, enrollmentStatus: status },
        });
      }
    }

    await runWithRequestContext({ userId }, async () => {
      await computeReportingPeriod(period1Id);
      await computeReportingPeriod(period2Id);
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects an unknown programId", async () => {
    const res = await request(app)
      .get("/api/accreditation/trends?programId=999999")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("returns both periods in chronological order with the program's actual completion trend", async () => {
    const res = await request(app)
      .get(`/api/accreditation/trends?programId=${programId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const periods = res.body.data.trends.filter((t: { reportingPeriod: { id: number } }) =>
      [period1Id, period2Id].includes(t.reportingPeriod.id),
    );
    expect(periods).toHaveLength(2);
    expect(periods[0].reportingPeriod.label).toBe("2024");
    expect(periods[0].metrics.COMPLETION).toMatchObject({ numerator: 1, denominator: 4, percentage: 25 });
    expect(periods[1].reportingPeriod.label).toBe("2025");
    expect(periods[1].metrics.COMPLETION).toMatchObject({ numerator: 3, denominator: 4, percentage: 75 });
  });

  it("returns the institution-wide rollup when programId is omitted", async () => {
    const res = await request(app).get("/api/accreditation/trends").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const period1Row = res.body.data.trends.find((t: { reportingPeriod: { id: number } }) => t.reportingPeriod.id === period1Id);
    expect(period1Row.metrics.COMPLETION).toMatchObject({ numerator: 1, denominator: 4 });
  });
});
