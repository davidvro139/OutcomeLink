import request from "supertest";
import { createApp } from "../../app";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import { computeNextRunAt } from "./scheduler";

const app = createApp();

describe("scheduled reports (integration)", () => {
  let institutionId: number;
  let campusId: number;
  let programId: number;
  let reportingPeriodId: number;
  let savedReportId: number;
  let adminId: number;
  let adminToken: string;
  let auditorToken: string;
  let careerServicesToken: string;
  let otherAdminToken: string;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Scheduled Reports Test Institution" } });
    institutionId = institution.id;
    const otherInstitution = await prisma.institution.create({ data: { name: "Other Scheduled Reports Institution" } });

    const campus = await prisma.campus.create({ data: { institutionId, name: "Main Campus" } });
    campusId = campus.id;
    const program = await prisma.program.create({
      data: { institutionId, campusId, name: "Automotive Technology", code: "SR-AUTO", credentialType: "Diploma" },
    });
    programId = program.id;

    const passwordHash = await hashPassword("password123");
    const admin = await prisma.user.create({
      data: { institutionId, name: "Admin", email: "admin@scheduled-reports-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    adminId = admin.id;
    await prisma.user.create({
      data: { institutionId, name: "Auditor", email: "auditor@scheduled-reports-test.edu", passwordHash, role: "READ_ONLY_AUDITOR" },
    });
    await prisma.user.create({
      data: { institutionId, name: "Career Services", email: "careerservices@scheduled-reports-test.edu", passwordHash, role: "CAREER_SERVICES_STAFF" },
    });
    await prisma.user.create({
      data: { institutionId: otherInstitution.id, name: "Other Admin", email: "admin@other-scheduled-reports-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });

    adminToken = (await request(app).post("/api/auth/login").send({ email: "admin@scheduled-reports-test.edu", password: "password123" })).body.data.accessToken;
    auditorToken = (await request(app).post("/api/auth/login").send({ email: "auditor@scheduled-reports-test.edu", password: "password123" })).body.data.accessToken;
    careerServicesToken = (await request(app).post("/api/auth/login").send({ email: "careerservices@scheduled-reports-test.edu", password: "password123" })).body.data.accessToken;
    otherAdminToken = (await request(app).post("/api/auth/login").send({ email: "admin@other-scheduled-reports-test.edu", password: "password123" })).body.data.accessToken;

    const framework = await prisma.accreditationFramework.create({ data: { name: "COE-SCHEDULED-REPORTS-TEST" } });
    const ruleSet = await prisma.ruleSet.create({
      data: {
        frameworkId: framework.id,
        versionLabel: "COE-2026-SCHEDULED-REPORTS-TEST",
        effectiveStartDate: new Date("2025-01-01"),
        ruleDefinition: { benchmarks: { completion: 60, placement: 70, licensure: 70 } },
      },
    });
    const period = await prisma.reportingPeriod.create({
      data: { institutionId, ruleSetId: ruleSet.id, label: "SR-TEST-PERIOD", startDate: new Date("2025-07-01"), endDate: new Date("2026-06-30") },
    });
    reportingPeriodId = period.id;

    const savedReport = await prisma.savedReport.create({
      data: {
        institutionId,
        createdBy: adminId,
        name: "SR Roster",
        definition: { entityType: "STUDENT", fields: ["internalStudentId"], filters: [{ field: "programId", value: [programId] }] },
      },
    });
    savedReportId = savedReport.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("computeNextRunAt", () => {
    // Asserted via local calendar components, not absolute-instant equality: computeNextRunAt
    // deliberately uses local Date methods (setDate/setMonth/setFullYear) for calendar-accurate
    // rollover, so a UTC-instant comparison would spuriously fail whenever the jump crosses a
    // DST boundary in the machine's local timezone (e.g. Jan -> Apr does, Jan -> Feb doesn't).
    function ymd(date: Date): [number, number, number] {
      return [date.getFullYear(), date.getMonth(), date.getDate()];
    }

    it("is calendar-accurate, not a fixed day-count", () => {
      expect(ymd(computeNextRunAt("DAILY", new Date(2026, 0, 31)))).toEqual([2026, 1, 1]);
      expect(ymd(computeNextRunAt("WEEKLY", new Date(2026, 0, 31)))).toEqual([2026, 1, 7]);
      // Jan 31 + 1 month overflows to Mar 3 (Date's documented setMonth rollover, not a bug to guard).
      expect(ymd(computeNextRunAt("MONTHLY", new Date(2026, 0, 31)))).toEqual([2026, 2, 3]);
      expect(ymd(computeNextRunAt("QUARTERLY", new Date(2026, 0, 1)))).toEqual([2026, 3, 1]);
      expect(ymd(computeNextRunAt("ANNUALLY", new Date(2026, 0, 1)))).toEqual([2027, 0, 1]);
    });
  });

  describe("create", () => {
    it("rejects without authentication", async () => {
      const res = await request(app)
        .post("/api/scheduled-reports")
        .send({ name: "X", frequency: "WEEKLY", reportSource: "SAVED_REPORT", savedReportId });
      expect(res.status).toBe(401);
    });

    it("rejects a Read-Only Auditor", async () => {
      const res = await request(app)
        .post("/api/scheduled-reports")
        .set("Authorization", `Bearer ${auditorToken}`)
        .send({ name: "X", frequency: "WEEKLY", reportSource: "SAVED_REPORT", savedReportId });
      expect(res.status).toBe(403);
    });

    it("rejects a payload with neither savedReportId nor builtInReportType", async () => {
      const res = await request(app)
        .post("/api/scheduled-reports")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "X", frequency: "WEEKLY", reportSource: "SAVED_REPORT" });
      expect(res.status).toBe(400);
    });

    it("rejects an unknown savedReportId", async () => {
      const res = await request(app)
        .post("/api/scheduled-reports")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "X", frequency: "WEEKLY", reportSource: "SAVED_REPORT", savedReportId: 999999 });
      expect(res.status).toBe(400);
    });

    it("creates a SAVED_REPORT subscription with nextRunAt one cycle out, not immediate", async () => {
      const before = Date.now();
      const res = await request(app)
        .post("/api/scheduled-reports")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Weekly Roster", frequency: "WEEKLY", reportSource: "SAVED_REPORT", savedReportId });
      expect(res.status).toBe(201);
      expect(res.body.data.subscription).toMatchObject({ name: "Weekly Roster", frequency: "WEEKLY", active: true });
      const nextRunAt = new Date(res.body.data.subscription.nextRunAt).getTime();
      expect(nextRunAt).toBeGreaterThan(before + 6 * 24 * 60 * 60 * 1000);
    });

    it("creates a BUILT_IN subscription with a fixed reporting period", async () => {
      const res = await request(app)
        .post("/api/scheduled-reports")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Monthly Outcomes", frequency: "MONTHLY", reportSource: "BUILT_IN", builtInReportType: "OUTCOME_FUNNEL", reportingPeriodId });
      expect(res.status).toBe(201);
      expect(res.body.data.subscription).toMatchObject({ name: "Monthly Outcomes", builtInReportType: "OUTCOME_FUNNEL" });
    });

    it("creates a BUILT_IN subscription with no fixed period (resolves dynamically at run time)", async () => {
      const res = await request(app)
        .post("/api/scheduled-reports")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Rolling Outcomes", frequency: "MONTHLY", reportSource: "BUILT_IN", builtInReportType: "OUTCOME_FUNNEL" });
      expect(res.status).toBe(201);
      expect(res.body.data.subscription.reportingPeriodId).toBeNull();
    });

    it("creates an EMPLOYER_ANALYTICS subscription with no period at all", async () => {
      const res = await request(app)
        .post("/api/scheduled-reports")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Quarterly Employer Report", frequency: "QUARTERLY", reportSource: "BUILT_IN", builtInReportType: "EMPLOYER_ANALYTICS" });
      expect(res.status).toBe(201);
    });
  });

  describe("visibility, run-now, run history, and download", () => {
    let subscriptionId: number;

    beforeAll(async () => {
      const res = await request(app)
        .post("/api/scheduled-reports")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Visibility Test Sub", frequency: "DAILY", reportSource: "SAVED_REPORT", savedReportId });
      subscriptionId = res.body.data.subscription.id;
    });

    it("does not appear in another institution's list", async () => {
      const res = await request(app).get("/api/scheduled-reports").set("Authorization", `Bearer ${otherAdminToken}`);
      expect(res.body.data.subscriptions.map((s: { id: number }) => s.id)).not.toContain(subscriptionId);
    });

    it("the Auditor is blocked by role before visibility is even checked", async () => {
      const run = await request(app).post(`/api/scheduled-reports/${subscriptionId}/run-now`).set("Authorization", `Bearer ${auditorToken}`);
      expect(run.status).toBe(403);
    });

    it("an operational-role peer who is neither the creator nor an institution-wide admin cannot see, run, or update someone else's subscription", async () => {
      const list = await request(app).get("/api/scheduled-reports").set("Authorization", `Bearer ${careerServicesToken}`);
      expect(list.body.data.subscriptions.map((s: { id: number }) => s.id)).not.toContain(subscriptionId);

      const run = await request(app).post(`/api/scheduled-reports/${subscriptionId}/run-now`).set("Authorization", `Bearer ${careerServicesToken}`);
      expect(run.status).toBe(404);

      const update = await request(app)
        .patch(`/api/scheduled-reports/${subscriptionId}`)
        .set("Authorization", `Bearer ${careerServicesToken}`)
        .send({ active: false });
      expect(update.status).toBe(404);
    });

    it("runs now, records a SUCCESS run, and returns a downloadable file", async () => {
      const runRes = await request(app)
        .post(`/api/scheduled-reports/${subscriptionId}/run-now`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(runRes.status).toBe(201);
      expect(runRes.body.data.run.status).toBe("SUCCESS");
      expect(runRes.body.data.run.fileReference).toBeTruthy();

      const runsList = await request(app)
        .get(`/api/scheduled-reports/${subscriptionId}/runs`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(runsList.body.data.runs).toHaveLength(1);

      const download = await request(app)
        .get(`/api/scheduled-reports/runs/${runRes.body.data.run.id}/download`)
        .set("Authorization", `Bearer ${adminToken}`)
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => callback(null, Buffer.concat(chunks)));
        });
      expect(download.status).toBe(200);
      expect(download.headers["content-type"]).toContain("spreadsheetml");
      expect((download.body as Buffer).length).toBeGreaterThan(0);

      const notification = await prisma.notification.findFirst({
        where: { userId: adminId, type: "SCHEDULED_REPORT_READY", referenceEntityId: runRes.body.data.run.id },
      });
      expect(notification).not.toBeNull();
      expect(notification!.message).toContain("Visibility Test Sub");
    });

    it("a run's download is refused to a non-creator, non-admin institution peer", async () => {
      const runs = await prisma.scheduledReportRun.findMany({ where: { subscriptionId } });
      const download = await request(app)
        .get(`/api/scheduled-reports/runs/${runs[0]!.id}/download`)
        .set("Authorization", `Bearer ${auditorToken}`);
      expect(download.status).toBe(404);
    });

    it("updating frequency recomputes nextRunAt from now", async () => {
      const before = Date.now();
      const res = await request(app)
        .patch(`/api/scheduled-reports/${subscriptionId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ frequency: "ANNUALLY" });
      expect(res.status).toBe(200);
      const nextRunAt = new Date(res.body.data.subscription.nextRunAt).getTime();
      expect(nextRunAt).toBeGreaterThan(before + 300 * 24 * 60 * 60 * 1000);
    });

    it("deletes a subscription, cascades its runs, and cleans up their notifications", async () => {
      const runs = await prisma.scheduledReportRun.findMany({ where: { subscriptionId } });
      const runIds = runs.map((r) => r.id);
      expect(runIds.length).toBeGreaterThan(0);
      const notificationsBefore = await prisma.notification.findMany({
        where: { type: "SCHEDULED_REPORT_READY", referenceEntityId: { in: runIds } },
      });
      expect(notificationsBefore.length).toBeGreaterThan(0);

      const res = await request(app).delete(`/api/scheduled-reports/${subscriptionId}`).set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);

      const remainingRuns = await prisma.scheduledReportRun.findMany({ where: { subscriptionId } });
      expect(remainingRuns).toHaveLength(0);

      // Notification has no real FK to ScheduledReportRun, so this wouldn't happen via cascade alone —
      // a stale notification pointing at a deleted run would otherwise leave a dead download link.
      const notificationsAfter = await prisma.notification.findMany({
        where: { type: "SCHEDULED_REPORT_READY", referenceEntityId: { in: runIds } },
      });
      expect(notificationsAfter).toHaveLength(0);
    });
  });

  describe("built-in report execution", () => {
    it("runs a CPL_READINESS subscription end to end", async () => {
      const create = await request(app)
        .post("/api/scheduled-reports")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Annual CPL Readiness", frequency: "ANNUALLY", reportSource: "BUILT_IN", builtInReportType: "CPL_READINESS", reportingPeriodId });
      const subscriptionId = create.body.data.subscription.id;

      const runRes = await request(app).post(`/api/scheduled-reports/${subscriptionId}/run-now`).set("Authorization", `Bearer ${adminToken}`);
      expect(runRes.status).toBe(201);
      expect(runRes.body.data.run.status).toBe("SUCCESS");
    });

    it("a subscription visible to an institutional administrator even if another user created it", async () => {
      const create = await request(app)
        .post("/api/scheduled-reports")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Admin-Created Sub For Visibility", frequency: "DAILY", reportSource: "SAVED_REPORT", savedReportId });
      const institutionalAdminPasswordHash = await hashPassword("password123");
      await prisma.user.create({
        data: { institutionId, name: "Institutional Admin", email: "instadmin@scheduled-reports-test.edu", passwordHash: institutionalAdminPasswordHash, role: "INSTITUTIONAL_ADMINISTRATOR" },
      });
      const instAdminToken = (await request(app).post("/api/auth/login").send({ email: "instadmin@scheduled-reports-test.edu", password: "password123" })).body.data.accessToken;

      const list = await request(app).get("/api/scheduled-reports").set("Authorization", `Bearer ${instAdminToken}`);
      expect(list.body.data.subscriptions.map((s: { id: number }) => s.id)).toContain(create.body.data.subscription.id);
    });
  });

  it("records a FAILED run and a failure notification when the saved report definition no longer validates", async () => {
    // A SavedReport's definition is only re-validated when a run actually happens (schema.prisma's
    // SavedReport doc comment) — this is the deterministic way to make that revalidation fail.
    const badSavedReport = await prisma.savedReport.create({
      data: { institutionId, createdBy: adminId, name: "Doomed Saved Report", definition: { entityType: "STUDENT", fields: ["notARealField"] } },
    });
    const create = await request(app)
      .post("/api/scheduled-reports")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Doomed Subscription", frequency: "DAILY", reportSource: "SAVED_REPORT", savedReportId: badSavedReport.id });
    const subscriptionId = create.body.data.subscription.id;

    const runRes = await request(app).post(`/api/scheduled-reports/${subscriptionId}/run-now`).set("Authorization", `Bearer ${adminToken}`);
    expect(runRes.body.data.run.status).toBe("FAILED");
    expect(runRes.body.data.run.errorMessage).toContain("Unknown field");

    const notification = await prisma.notification.findFirst({
      where: { userId: adminId, type: "SCHEDULED_REPORT_READY", referenceEntityId: runRes.body.data.run.id },
    });
    expect(notification!.message).toContain("failed to run");
  });
});
