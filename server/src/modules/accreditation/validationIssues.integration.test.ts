import request from "supertest";
import { createApp } from "../../app";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";

const app = createApp();

describe("validation issue resolution (integration)", () => {
  let institutionId: number;
  let reportingPeriodId: number;
  let adminToken: string;
  let auditorToken: string;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Validation Issues Test Institution" } });
    institutionId = institution.id;

    const framework = await prisma.accreditationFramework.create({ data: { name: "COE-ISSUES-TEST" } });
    const ruleSet = await prisma.ruleSet.create({
      data: {
        frameworkId: framework.id,
        versionLabel: "COE-2026-ISSUES-TEST",
        effectiveStartDate: new Date("2025-01-01"),
        ruleDefinition: { benchmarks: { completion: 60, placement: 70, licensure: 70 } },
      },
    });
    const period = await prisma.reportingPeriod.create({
      data: {
        institutionId,
        ruleSetId: ruleSet.id,
        label: "ISSUES-TEST-PERIOD",
        startDate: new Date("2025-07-01"),
        endDate: new Date("2026-06-30"),
      },
    });
    reportingPeriodId = period.id;

    const passwordHash = await hashPassword("password123");
    await prisma.user.create({
      data: { institutionId, name: "Admin", email: "admin@issues-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    await prisma.user.create({
      data: { institutionId, name: "Auditor", email: "auditor@issues-test.edu", passwordHash, role: "READ_ONLY_AUDITOR" },
    });

    const adminLogin = await request(app).post("/api/auth/login").send({ email: "admin@issues-test.edu", password: "password123" });
    adminToken = adminLogin.body.data.accessToken;
    const auditorLogin = await request(app).post("/api/auth/login").send({ email: "auditor@issues-test.edu", password: "password123" });
    auditorToken = auditorLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function makeIssue(issueType: string) {
    const issue = await prisma.validationIssue.create({
      data: { reportingPeriodId, issueType, severity: "INFORMATION" },
    });
    return issue.id;
  }

  it("rejects a Read-Only Auditor from resolving an issue", async () => {
    const issueId = await makeIssue("TEST_ISSUE_1");
    const res = await request(app)
      .patch(`/api/accreditation/reporting-periods/${reportingPeriodId}/validation-issues/${issueId}/resolve`)
      .set("Authorization", `Bearer ${auditorToken}`);
    expect(res.status).toBe(403);
  });

  it("resolves a single issue", async () => {
    const issueId = await makeIssue("TEST_ISSUE_2");
    const res = await request(app)
      .patch(`/api/accreditation/reporting-periods/${reportingPeriodId}/validation-issues/${issueId}/resolve`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.issue).toMatchObject({ id: issueId, resolvedBy: "Admin" });
    expect(res.body.data.issue.resolvedAt).not.toBeNull();
  });

  describe("bulk resolve", () => {
    it("rejects a Read-Only Auditor", async () => {
      const issueId = await makeIssue("TEST_ISSUE_BULK_AUTH");
      const res = await request(app)
        .patch(`/api/accreditation/reporting-periods/${reportingPeriodId}/validation-issues/bulk-resolve`)
        .set("Authorization", `Bearer ${auditorToken}`)
        .send({ issueIds: [issueId] });
      expect(res.status).toBe(403);
    });

    it("resolves multiple open issues in one call and reports the count", async () => {
      const [id1, id2, id3] = await Promise.all([
        makeIssue("TEST_ISSUE_BULK_A"),
        makeIssue("TEST_ISSUE_BULK_B"),
        makeIssue("TEST_ISSUE_BULK_C"),
      ]);

      const res = await request(app)
        .patch(`/api/accreditation/reporting-periods/${reportingPeriodId}/validation-issues/bulk-resolve`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ issueIds: [id1, id2, id3] });

      expect(res.status).toBe(200);
      expect(res.body.data.resolvedCount).toBe(3);

      const remaining = await prisma.validationIssue.findMany({
        where: { id: { in: [id1, id2, id3] }, resolvedAt: null },
      });
      expect(remaining).toHaveLength(0);
    });

    it("silently excludes an already-resolved issue and one from a different period from the count", async () => {
      const alreadyResolved = await makeIssue("TEST_ISSUE_BULK_ALREADY");
      await prisma.validationIssue.update({
        where: { id: alreadyResolved },
        data: { resolvedAt: new Date(), resolvedBy: "Someone Else" },
      });

      const otherFramework = await prisma.accreditationFramework.create({ data: { name: "COE-ISSUES-TEST-OTHER" } });
      const otherRuleSet = await prisma.ruleSet.create({
        data: {
          frameworkId: otherFramework.id,
          versionLabel: "COE-2026-ISSUES-TEST-OTHER",
          effectiveStartDate: new Date("2025-01-01"),
          ruleDefinition: { benchmarks: { completion: 60, placement: 70, licensure: 70 } },
        },
      });
      const otherPeriod = await prisma.reportingPeriod.create({
        data: {
          institutionId,
          ruleSetId: otherRuleSet.id,
          label: "ISSUES-TEST-OTHER-PERIOD",
          startDate: new Date("2024-07-01"),
          endDate: new Date("2025-06-30"),
        },
      });
      const otherPeriodIssue = await prisma.validationIssue.create({
        data: { reportingPeriodId: otherPeriod.id, issueType: "TEST_ISSUE_OTHER_PERIOD", severity: "INFORMATION" },
      });

      const openIssue = await makeIssue("TEST_ISSUE_BULK_MIXED_OPEN");

      const res = await request(app)
        .patch(`/api/accreditation/reporting-periods/${reportingPeriodId}/validation-issues/bulk-resolve`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ issueIds: [alreadyResolved, otherPeriodIssue.id, openIssue] });

      expect(res.status).toBe(200);
      expect(res.body.data.resolvedCount).toBe(1);

      const stillOpenOtherPeriod = await prisma.validationIssue.findUnique({ where: { id: otherPeriodIssue.id } });
      expect(stillOpenOtherPeriod?.resolvedAt).toBeNull();
    });
  });
});
