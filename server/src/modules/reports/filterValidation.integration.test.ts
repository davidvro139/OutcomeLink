import request from "supertest";
import { createApp } from "../../app";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import type { ReportEntityType } from "@outcomelink/shared";

interface RunReportInput {
  entityType: ReportEntityType;
  fields: string[];
  filters?: Array<{ field: string; value: unknown }>;
  reportingPeriodIds?: number[];
}

const app = createApp();

describe("report filter validation (integration)", () => {
  let institutionId: number;
  let adminToken: string;
  let programId: number;
  let campusId: number;
  let reportingPeriodId: number;

  const runReport = (body: RunReportInput) =>
    request(app)
      .post("/api/reports/custom/run")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(body);

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Filter Validation Test" } });
    institutionId = institution.id;

    const passwordHash = await hashPassword("password123");
    await prisma.user.create({
      data: {
        institutionId,
        name: "Admin",
        email: "filter-admin@test.edu",
        passwordHash,
        role: "SYSTEM_ADMINISTRATOR",
      },
    });
    adminToken = (
      await request(app).post("/api/auth/login").send({ email: "filter-admin@test.edu", password: "password123" })
    ).body.data.accessToken;

    const campus = await prisma.campus.create({ data: { institutionId, name: "Main Campus" } });
    campusId = campus.id;

    const program = await prisma.program.create({
      data: {
        institutionId,
        campusId,
        name: "Test Program",
        code: "TEST",
        credentialType: "Certificate",
      },
    });
    programId = program.id;

    const framework = await prisma.accreditationFramework.create({
      data: { name: `FV-FW-${Date.now()}` },
    });
    const ruleSet = await prisma.ruleSet.create({
      data: {
        frameworkId: framework.id,
        versionLabel: "2024",
        effectiveStartDate: new Date("2024-01-01"),
        ruleDefinition: {},
      },
    });
    const period = await prisma.reportingPeriod.create({
      data: {
        institutionId,
        ruleSetId: ruleSet.id,
        label: "2024-2025",
        startDate: new Date("2024-01-01"),
        endDate: new Date("2025-01-01"),
      },
    });
    reportingPeriodId = period.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("value type validation", () => {
    it("rejects array value for scalar filter (active)", async () => {
      const res = await runReport({
        entityType: "EMPLOYER",
        fields: ["name"],
        filters: [{ field: "active", value: [true, false] }],
      });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("expects scalar value");
    });

    it("rejects scalar value for array filter (industry)", async () => {
      const res = await runReport({
        entityType: "EMPLOYER",
        fields: ["name"],
        filters: [{ field: "industry", value: "Tech" }],
      });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("expects array");
    });

    it("rejects wrong element type (string instead of number for programId)", async () => {
      const res = await runReport({
        entityType: "STUDENT",
        fields: ["firstName"],
        filters: [{ field: "programId", value: ["abc"] }],
      });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("expects number");
    });

    it("rejects wrong element type (number instead of string for enrollmentStatus)", async () => {
      const res = await runReport({
        entityType: "STUDENT",
        fields: ["firstName"],
        filters: [{ field: "enrollmentStatus", value: [123] }],
      });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("expects string");
    });
  });

  describe("duplicate filter detection", () => {
    it("rejects duplicate filters for the same field", async () => {
      const res = await runReport({
        entityType: "STUDENT",
        fields: ["firstName"],
        filters: [
          { field: "enrollmentStatus", value: ["ACTIVE"] },
          { field: "enrollmentStatus", value: ["WITHDRAWN"] },
        ],
      });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("Duplicate filter");
    });

    it("allows different filters", async () => {
      const res = await runReport({
        entityType: "STUDENT",
        fields: ["firstName"],
        filters: [
          { field: "enrollmentStatus", value: ["ACTIVE"] },
          { field: "programId", value: [programId] },
        ],
      });
      // Should succeed or fail for a different reason (missing data), not filter validation
      expect([200, 400]).toContain(res.status);
      if (res.status === 400) {
        expect(res.body.error.message).not.toContain("Duplicate");
      }
    });
  });

  describe("enum value validation", () => {
    it("accepts valid enrollmentStatus values", async () => {
      const res = await runReport({
        entityType: "STUDENT",
        fields: ["firstName"],
        filters: [{ field: "enrollmentStatus", value: ["ACTIVE", "WITHDRAWN"] }],
      });
      expect(res.status).not.toBe(400);
    });

    it("rejects invalid enrollmentStatus values", async () => {
      const res = await runReport({
        entityType: "STUDENT",
        fields: ["firstName"],
        filters: [{ field: "enrollmentStatus", value: ["INVALID_STATUS"] }],
      });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("invalid value");
    });

    it("accepts valid employmentStatus values", async () => {
      const res = await runReport({
        entityType: "STUDENT",
        fields: ["firstName"],
        reportingPeriodIds: [reportingPeriodId],
        filters: [{ field: "employmentStatus", value: ["EMPLOYED", "UNEMPLOYED"] }],
      });
      expect(res.status).not.toBe(400);
    });

    it("rejects invalid employmentStatus values", async () => {
      const res = await runReport({
        entityType: "STUDENT",
        fields: ["firstName"],
        reportingPeriodIds: [reportingPeriodId],
        filters: [{ field: "employmentStatus", value: ["TOTALLY_EMPLOYED"] }],
      });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("invalid value");
    });
  });

  describe("ID reference validation", () => {
    it("accepts valid programId", async () => {
      const res = await runReport({
        entityType: "STUDENT",
        fields: ["firstName"],
        filters: [{ field: "programId", value: [programId] }],
      });
      expect(res.status).not.toBe(400);
    });

    it("rejects invalid programId", async () => {
      const res = await runReport({
        entityType: "STUDENT",
        fields: ["firstName"],
        filters: [{ field: "programId", value: [99999] }],
      });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("Unknown program ID");
    });

    it("accepts valid campusId", async () => {
      const res = await runReport({
        entityType: "STUDENT",
        fields: ["firstName"],
        filters: [{ field: "campusId", value: [campusId] }],
      });
      expect(res.status).not.toBe(400);
    });

    it("rejects invalid campusId", async () => {
      const res = await runReport({
        entityType: "STUDENT",
        fields: ["firstName"],
        filters: [{ field: "campusId", value: [99999] }],
      });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("Unknown campus ID");
    });

    it("reports all invalid IDs in one error message", async () => {
      const res = await runReport({
        entityType: "STUDENT",
        fields: ["firstName"],
        filters: [{ field: "programId", value: [99999, 88888, 77777] }],
      });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("99999");
      expect(res.body.error.message).toContain("88888");
      expect(res.body.error.message).toContain("77777");
    });
  });
});
