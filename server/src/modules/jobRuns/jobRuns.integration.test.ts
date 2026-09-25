import request from "supertest";
import { createApp } from "../../app";
import { processRetries, runJob } from "../../lib/jobRunner";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";

const app = createApp();

describe("job runner and job history (integration)", () => {
  let institutionId: number;
  let adminId: number;
  let adminToken: string;
  let careerToken: string;
  let otherAdminToken: string;
  let reportingPeriodId: number;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Job Runs Test Institution" } });
    institutionId = institution.id;
    const other = await prisma.institution.create({ data: { name: "Other Job Runs Institution" } });

    const passwordHash = await hashPassword("password123");
    adminId = (
      await prisma.user.create({
        data: { institutionId, name: "Admin", email: "admin@job-runs-test.edu", passwordHash, role: "INSTITUTIONAL_ADMINISTRATOR" },
      })
    ).id;
    await prisma.user.create({
      data: { institutionId, name: "Career", email: "career@job-runs-test.edu", passwordHash, role: "CAREER_SERVICES_STAFF" },
    });
    await prisma.user.create({
      data: { institutionId: other.id, name: "Other", email: "admin@other-job-runs-test.edu", passwordHash, role: "INSTITUTIONAL_ADMINISTRATOR" },
    });
    const login = async (email: string) =>
      (await request(app).post("/api/auth/login").send({ email, password: "password123" })).body.data.accessToken as string;
    adminToken = await login("admin@job-runs-test.edu");
    careerToken = await login("career@job-runs-test.edu");
    otherAdminToken = await login("admin@other-job-runs-test.edu");

    const framework = await prisma.accreditationFramework.create({ data: { name: "COE-JOB-RUNS-TEST" } });
    const ruleSet = await prisma.ruleSet.create({
      data: {
        frameworkId: framework.id,
        versionLabel: "COE-2026-JOB-RUNS-TEST",
        effectiveStartDate: new Date("2025-01-01"),
        ruleDefinition: { benchmarks: { completion: 60, placement: 70, licensure: 70 } },
      },
    });
    reportingPeriodId = (
      await prisma.reportingPeriod.create({
        data: { institutionId, ruleSetId: ruleSet.id, label: "JR-PERIOD", startDate: new Date("2025-07-01"), endDate: new Date("2026-06-30") },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** A scheduled report whose saved definition no longer validates — deterministically fails on every attempt. */
  async function doomedSubscription(name: string) {
    const saved = await prisma.savedReport.create({
      data: { institutionId, createdBy: adminId, name: `${name} report`, definition: { entityType: "STUDENT", fields: ["notARealField"] } },
    });
    return prisma.scheduledReportSubscription.create({
      data: {
        institutionId,
        createdBy: adminId,
        name,
        frequency: "DAILY",
        reportSource: "SAVED_REPORT",
        savedReportId: saved.id,
        nextRunAt: new Date(),
      },
    });
  }

  function failureNotifications(runIds: number[]) {
    return prisma.notification.count({
      where: { userId: adminId, type: "SCHEDULED_REPORT_READY", referenceEntityId: { in: runIds }, message: { contains: "failed to run" } },
    });
  }

  describe("retries", () => {
    it("parks a failed scheduled run for retry without notifying, then fails it after the last attempt and notifies once", async () => {
      const sub = await doomedSubscription("Retry Subscription");

      const first = await runJob("SCHEDULED_REPORT", {
        institutionId,
        params: { subscriptionId: sub.id },
        trigger: "SCHEDULE",
      });
      expect(first.status).toBe("RETRY_PENDING");
      expect(first.attempt).toBe(1);
      expect(first.maxAttempts).toBe(3);
      expect(first.errorMessage).toContain("Unknown field");
      expect(first.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());

      const attemptRuns = () => prisma.scheduledReportRun.findMany({ where: { subscriptionId: sub.id } });
      expect(await failureNotifications((await attemptRuns()).map((r) => r.id))).toBe(0);

      // Not due yet: a sweep leaves it alone.
      await processRetries();
      expect((await prisma.jobRun.findUniqueOrThrow({ where: { id: first.id } })).attempt).toBe(1);

      for (const expectedAttempt of [2, 3]) {
        await prisma.jobRun.update({ where: { id: first.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
        await processRetries();
        const run = await prisma.jobRun.findUniqueOrThrow({ where: { id: first.id } });
        expect(run.attempt).toBe(expectedAttempt);
        expect(run.status).toBe(expectedAttempt === 3 ? "FAILED" : "RETRY_PENDING");
      }

      const final = await prisma.jobRun.findUniqueOrThrow({ where: { id: first.id } });
      expect(final.finishedAt).not.toBeNull();
      expect(final.nextAttemptAt).toBeNull();
      // One ScheduledReportRun per attempt, but the creator hears about it only after the final one.
      const runs = await attemptRuns();
      expect(runs).toHaveLength(3);
      expect(await failureNotifications(runs.map((r) => r.id))).toBe(1);
    });

    it("a successful retry ends the run as SUCCESS", async () => {
      const sub = await doomedSubscription("Recovering Subscription");
      const first = await runJob("SCHEDULED_REPORT", {
        institutionId,
        params: { subscriptionId: sub.id },
        trigger: "SCHEDULE",
      });
      expect(first.status).toBe("RETRY_PENDING");

      // The underlying problem gets fixed before the retry.
      await prisma.savedReport.update({
        where: { id: sub.savedReportId! },
        data: { definition: { entityType: "STUDENT", fields: ["internalStudentId"], filters: [] } },
      });
      await prisma.jobRun.update({ where: { id: first.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
      await processRetries();

      const run = await prisma.jobRun.findUniqueOrThrow({ where: { id: first.id } });
      expect({ status: run.status, error: run.errorMessage }).toEqual({ status: "SUCCESS", error: null });
      expect(run.attempt).toBe(2);
      expect(run.errorMessage).toBeNull();
      expect(run.result).toMatchObject({ scheduledReportRunId: expect.any(Number) });
    });

    it("skips, rather than fails, a subscription deleted before its retry", async () => {
      const sub = await doomedSubscription("Deleted Subscription");
      const first = await runJob("SCHEDULED_REPORT", {
        institutionId,
        params: { subscriptionId: sub.id },
        trigger: "SCHEDULE",
      });
      await prisma.scheduledReportSubscription.delete({ where: { id: sub.id } });
      await prisma.jobRun.update({ where: { id: first.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
      await processRetries();

      const run = await prisma.jobRun.findUniqueOrThrow({ where: { id: first.id } });
      expect({ status: run.status, error: run.errorMessage }).toEqual({ status: "SUCCESS", error: null });
      expect(run.result).toMatchObject({ skipped: expect.any(String) });
    });

    it("re-runs only the reporting periods that failed", async () => {
      const spy = jest.spyOn(await import("../accreditation/validation"), "runValidationAndNotify");
      spy.mockRejectedValueOnce(new Error("transient database error"));
      try {
        const run = await runJob("NIGHTLY_VALIDATION", { institutionId, trigger: "SCHEDULE" });
        expect(run.status).toBe("RETRY_PENDING");
        expect(run.errorMessage).toContain(`#${reportingPeriodId}`);
        expect(run.params).toEqual({ periodIds: [reportingPeriodId] });

        await prisma.jobRun.update({ where: { id: run.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
        await processRetries();
        const retried = await prisma.jobRun.findUniqueOrThrow({ where: { id: run.id } });
        expect(retried.status).toBe("SUCCESS");
        expect(retried.result).toEqual({ periodsValidated: 1 });
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe("manual runs", () => {
    it("records a manual campaign run with the requester and its result, and does not auto-retry a failure", async () => {
      const res = await request(app)
        .post("/api/surveys/graduate-campaign")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ reportingPeriodId });
      expect(res.status).toBe(201);

      const run = await prisma.jobRun.findFirstOrThrow({
        where: { institutionId, jobType: "GRADUATE_CAMPAIGN" },
        orderBy: { id: "desc" },
      });
      expect(run).toMatchObject({ trigger: "MANUAL", requestedBy: adminId, status: "SUCCESS", maxAttempts: 1 });
      expect(run.result).toMatchObject({ targetedCount: expect.any(Number) });
    });
  });

  describe("job history API", () => {
    it("lists only the caller's institution's runs, filterable", async () => {
      const list = await request(app).get("/api/job-runs?pageSize=100").set("Authorization", `Bearer ${adminToken}`);
      expect(list.status).toBe(200);
      expect(list.body.data.length).toBeGreaterThan(0);
      expect(list.body.data.every((r: { institutionId: number | null }) => r.institutionId === institutionId)).toBe(true);

      const failedOnly = await request(app).get("/api/job-runs?status=FAILED").set("Authorization", `Bearer ${adminToken}`);
      expect(failedOnly.body.data.every((r: { status: string }) => r.status === "FAILED")).toBe(true);

      const other = await request(app).get("/api/job-runs").set("Authorization", `Bearer ${otherAdminToken}`);
      expect(other.body.data).toHaveLength(0);
    });

    it("is admin-only", async () => {
      const res = await request(app).get("/api/job-runs").set("Authorization", `Bearer ${careerToken}`);
      expect(res.status).toBe(403);
    });

    it("retries a failed run on the same row, and refuses one that isn't failed or isn't visible", async () => {
      const sub = await doomedSubscription("Manual Retry Subscription");
      const failed = await runJob("SCHEDULED_REPORT", {
        institutionId,
        params: { subscriptionId: sub.id },
        trigger: "MANUAL",
      });
      expect(failed.status).toBe("FAILED");

      await prisma.savedReport.update({
        where: { id: sub.savedReportId! },
        data: { definition: { entityType: "STUDENT", fields: ["internalStudentId"], filters: [] } },
      });

      const hidden = await request(app).post(`/api/job-runs/${failed.id}/retry`).set("Authorization", `Bearer ${otherAdminToken}`);
      expect(hidden.status).toBe(404);

      const retry = await request(app).post(`/api/job-runs/${failed.id}/retry`).set("Authorization", `Bearer ${adminToken}`);
      expect(retry.status).toBe(200);
      expect(retry.body.data.run).toMatchObject({ id: failed.id, status: "SUCCESS", attempt: 2 });

      const again = await request(app).post(`/api/job-runs/${failed.id}/retry`).set("Authorization", `Bearer ${adminToken}`);
      expect(again.status).toBe(409);
    });
  });
});
