import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../../app";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import { computeUnknownOutcomes } from "./reports";

const app = createApp();

/** Report pagination and bounded exports (docs/TODO.md). */
describe("report pagination and bounded exports (integration)", () => {
  let institutionId: number;
  let campusId: number;
  let programId: number;
  let reportingPeriodId: number;
  let adminToken: string;
  let adminId: number;
  let otherAdminToken: string;
  let careerServicesToken: string;

  async function poll<T>(fn: () => Promise<T | null>, timeoutMs = 20000): Promise<T> {
    const start = Date.now();
    for (;;) {
      const value = await fn();
      if (value) return value;
      if (Date.now() - start > timeoutMs) throw new Error("timed out waiting for condition");
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Report Pagination Institution" } });
    institutionId = institution.id;
    const other = await prisma.institution.create({ data: { name: "Other Report Pagination Institution" } });

    const campus = await prisma.campus.create({ data: { institutionId, name: "Main Campus" } });
    campusId = campus.id;
    const program = await prisma.program.create({
      data: { institutionId, campusId, name: "Licensed Program", code: "RP-LIC", credentialType: "Diploma", licensureRequired: true },
    });
    programId = program.id;
    await prisma.program.create({
      data: { institutionId, campusId, name: "Second Program", code: "RP-TWO", credentialType: "Diploma" },
    });

    const passwordHash = await hashPassword("password123");
    const admin = await prisma.user.create({
      data: { institutionId, name: "Admin", email: "admin@report-pagination.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    adminId = admin.id;
    await prisma.user.create({
      data: { institutionId, name: "CS", email: "cs@report-pagination.edu", passwordHash, role: "CAREER_SERVICES_STAFF" },
    });
    await prisma.user.create({
      data: { institutionId: other.id, name: "Other", email: "other@report-pagination.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    const login = async (email: string) =>
      (await request(app).post("/api/auth/login").send({ email, password: "password123" })).body.data.accessToken as string;
    adminToken = await login("admin@report-pagination.edu");
    careerServicesToken = await login("cs@report-pagination.edu");
    otherAdminToken = await login("other@report-pagination.edu");

    const framework = await prisma.accreditationFramework.create({ data: { name: "COE-RP-TEST" } });
    const ruleSet = await prisma.ruleSet.create({
      data: {
        frameworkId: framework.id,
        versionLabel: "COE-2026-RP-TEST",
        effectiveStartDate: new Date("2025-01-01"),
        ruleDefinition: { benchmarks: { completion: 60, placement: 70, licensure: 70 } },
      },
    });
    const period = await prisma.reportingPeriod.create({
      data: { institutionId, ruleSetId: ruleSet.id, label: "RP-P1", startDate: new Date("2025-07-01"), endDate: new Date("2026-06-30") },
    });
    reportingPeriodId = period.id;
    await prisma.reportingPeriod.create({
      data: { institutionId, ruleSetId: ruleSet.id, label: "RP-P2", startDate: new Date("2024-07-01"), endDate: new Date("2025-06-30") },
    });

    await prisma.employer.createMany({
      data: Array.from({ length: 501 }, (_, i) => ({ institutionId, name: `Small ${String(i).padStart(4, "0")}`, industry: "Small" })),
    });
    await prisma.employer.createMany({
      data: Array.from({ length: 5001 }, (_, i) => ({ institutionId, name: `Big ${String(i).padStart(4, "0")}`, industry: "Big" })),
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const run = (body: object, token = adminToken) =>
    request(app).post("/api/reports/custom/run").set("Authorization", `Bearer ${token}`).send(body);

  describe("Custom Report Builder preview", () => {
    it("caps EMPLOYER rows at the DB layer with an exact totalCount", async () => {
      const res = await run({ entityType: "EMPLOYER", fields: ["name"], filters: [{ field: "industry", value: ["Small"] }] });
      expect(res.status).toBe(200);
      expect(res.body.data.rows).toHaveLength(500);
      expect(res.body.data.totalCount).toBe(501);
      expect(res.body.data.truncated).toBe(true);
    });

    it("scales the exact totalCount across multiple periods", async () => {
      const periods = await prisma.reportingPeriod.findMany({ where: { institutionId } });
      const res = await run({
        entityType: "EMPLOYER",
        fields: ["name"],
        filters: [{ field: "industry", value: ["Small"] }],
        reportingPeriodIds: periods.map((p) => p.id),
      });
      expect(res.body.data.totalCount).toBe(501 * 2);
      expect(res.body.data.rows.length).toBeLessThanOrEqual(500);
    });

    it("keeps PROGRAM totals exact and untruncated for a small set", async () => {
      const res = await run({ entityType: "PROGRAM", fields: ["name"] });
      expect(res.body.data.totalCount).toBe(2);
      expect(res.body.data.truncated).toBe(false);
    });
  });

  describe("synchronous export guard", () => {
    it("still exports a report under the threshold directly", async () => {
      const res = await request(app)
        .post("/api/reports/custom/export")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ entityType: "EMPLOYER", fields: ["name"], filters: [{ field: "industry", value: ["Small"] }] });
      expect(res.status).toBe(200);
    });

    it("rejects a direct export over the threshold, pointing at the queued path", async () => {
      const res = await request(app)
        .post("/api/reports/custom/export")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ entityType: "EMPLOYER", fields: ["name"], filters: [{ field: "industry", value: ["Big"] }] });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("queue it as a background export");
    });
  });

  describe("queued export jobs", () => {
    let jobId: number;

    it("queues, completes in the background, notifies, and downloads", async () => {
      const queued = await request(app)
        .post("/api/reports/custom/export-jobs")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ entityType: "EMPLOYER", fields: ["name"], filters: [{ field: "industry", value: ["Big"] }] });
      expect(queued.status).toBe(202);
      expect(queued.body.data.job.status).toBe("PENDING");
      jobId = queued.body.data.job.id;

      const finished = await poll(async () => {
        const job = await prisma.reportExportJob.findUnique({ where: { id: jobId } });
        return job && job.status !== "PENDING" ? job : null;
      });
      expect(finished.status).toBe("SUCCESS");
      expect(finished.rowCount).toBe(5001);

      const notification = await prisma.notification.findFirst({
        where: { userId: adminId, type: "REPORT_EXPORT_READY", referenceEntityId: jobId },
      });
      expect(notification).not.toBeNull();

      const download = await request(app)
        .get(`/api/reports/custom/export-jobs/${jobId}/download`)
        .set("Authorization", `Bearer ${adminToken}`)
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => callback(null, Buffer.concat(chunks)));
        });
      expect(download.status).toBe(200);
      expect((download.body as Buffer).length).toBeGreaterThan(0);
    });

    it("lists the requester's jobs and hides them from others", async () => {
      const mine = await request(app).get("/api/reports/custom/export-jobs").set("Authorization", `Bearer ${adminToken}`);
      expect(mine.body.data.jobs.map((j: { id: number }) => j.id)).toContain(jobId);

      const peer = await request(app).get("/api/reports/custom/export-jobs").set("Authorization", `Bearer ${careerServicesToken}`);
      expect(peer.body.data.jobs.map((j: { id: number }) => j.id)).not.toContain(jobId);
      const peerDownload = await request(app)
        .get(`/api/reports/custom/export-jobs/${jobId}/download`)
        .set("Authorization", `Bearer ${careerServicesToken}`);
      expect(peerDownload.status).toBe(404);

      const foreign = await request(app)
        .get(`/api/reports/custom/export-jobs/${jobId}/download`)
        .set("Authorization", `Bearer ${otherAdminToken}`);
      expect(foreign.status).toBe(404);
    });

    it("records a FAILED job and still notifies when generation fails", async () => {
      const queued = await request(app)
        .post("/api/reports/custom/export-jobs")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ entityType: "EMPLOYER", fields: ["notARealField"] });
      const failedId = queued.body.data.job.id;
      const finished = await poll(async () => {
        const job = await prisma.reportExportJob.findUnique({ where: { id: failedId } });
        return job && job.status !== "PENDING" ? job : null;
      });
      expect(finished.status).toBe("FAILED");
      expect(finished.errorMessage).toContain("Unknown field");
      const notification = await prisma.notification.findFirst({
        where: { userId: adminId, type: "REPORT_EXPORT_READY", referenceEntityId: failedId },
      });
      expect(notification!.message).toContain("failed");
    });
  });

  describe("Licensure Queue pagination", () => {
    beforeAll(async () => {
      for (let i = 0; i < 3; i++) {
        const student = await prisma.student.create({
          data: { institutionId, internalStudentId: `RP-LQ-${i}`, firstName: "Lic", lastName: `Student${i}` },
        });
        await prisma.studentEnrollment.create({
          data: {
            studentId: student.id,
            programId,
            campusId,
            startDate: new Date("2025-01-01"),
            actualCompletionDate: new Date(`2026-01-0${i + 1}`),
            enrollmentStatus: "GRADUATE_COMPLETER",
          },
        });
        // One of them already passed, so it must be excluded from the total.
        if (i === 2) {
          await prisma.licensureResult.create({
            data: { studentId: student.id, programId, examName: "NCLEX", result: "PASSED", attemptNumber: 1 },
          });
        }
      }
    });

    it("paginates the eligible population with exact totals", async () => {
      const first = await request(app).get("/api/licensure/queue?pageSize=1&page=1").set("Authorization", `Bearer ${adminToken}`);
      expect(first.status).toBe(200);
      expect(first.body.data).toHaveLength(1);
      expect(first.body.meta.pagination).toMatchObject({ totalItems: 2, totalPages: 2, page: 1 });

      const second = await request(app).get("/api/licensure/queue?pageSize=1&page=2").set("Authorization", `Bearer ${adminToken}`);
      expect(second.body.data).toHaveLength(1);
      expect(second.body.data[0].student.id).not.toBe(first.body.data[0].student.id);
    });
  });

  describe("report row-list caps", () => {
    it("caps Unknown Outcomes' student list but keeps exact totals, and stays uncapped for built-in callers", async () => {
      await prisma.student.createMany({
        data: Array.from({ length: 201 }, (_, i) => ({
          institutionId,
          internalStudentId: `RP-UO-${i}`,
          firstName: "Unknown",
          lastName: `Outcome${i}`,
        })),
      });
      const created = await prisma.student.findMany({ where: { institutionId, internalStudentId: { startsWith: "RP-UO-" } } });
      await prisma.studentEnrollment.createMany({
        data: created.map((s) => ({
          studentId: s.id,
          programId,
          campusId,
          startDate: new Date("2025-01-01"),
          actualCompletionDate: new Date("2026-01-01"),
          enrollmentStatus: "GRADUATE_COMPLETER" as const,
        })),
      });
      const enrollments = await prisma.studentEnrollment.findMany({ where: { studentId: { in: created.map((s) => s.id) } } });
      const ruleSet = await prisma.ruleSet.findFirstOrThrow({ where: { versionLabel: "COE-2026-RP-TEST" } });
      await prisma.studentClassification.createMany({
        data: enrollments.map((e) => ({
          studentEnrollmentId: e.id,
          reportingPeriodId,
          metric: "PLACEMENT" as const,
          classificationCode: "SEEKING_OR_UNKNOWN",
          determinedByRuleSetId: ruleSet.id,
        })),
      });

      const res = await request(app)
        .get(`/api/reports/unknown-outcomes?reportingPeriodId=${reportingPeriodId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.students).toHaveLength(200);
      expect(res.body.data.studentsTruncated).toBe(true);
      expect(res.body.data.totalSeekingOrUnknown).toBe(201);

      const uncapped = await computeUnknownOutcomes(institutionId, reportingPeriodId, null);
      expect(uncapped.students).toHaveLength(201);
      expect(uncapped.studentsTruncated).toBe(false);
    });

    it("caps each program's Skills-Gap notes to the most recent 20", async () => {
      const employer = await prisma.employer.create({ data: { institutionId, name: "Notes Employer" } });
      const student = await prisma.student.create({
        data: { institutionId, internalStudentId: "RP-SG-1", firstName: "Skills", lastName: "Gap" },
      });
      await prisma.studentEnrollment.create({
        data: { studentId: student.id, programId, campusId, startDate: new Date("2025-01-01"), actualCompletionDate: new Date("2026-02-01"), enrollmentStatus: "GRADUATE_COMPLETER" },
      });
      for (let i = 0; i < 21; i++) {
        const survey = await prisma.employerSurvey.create({
          data: { studentId: student.id, employerId: employer.id, sentAt: new Date(), responseToken: randomUUID() },
        });
        await prisma.employerSurveyResponse.create({
          data: {
            surveyId: survey.id,
            technicalPreparednessRating: 3,
            communicationRating: 3,
            problemSolvingRating: 3,
            professionalismRating: 3,
            skillsGapNotes: `note ${i}`,
            submittedAt: new Date(Date.now() - (21 - i) * 60_000),
          },
        });
      }

      const res = await request(app).get("/api/reports/skills-gap").set("Authorization", `Bearer ${adminToken}`);
      const row = res.body.data.byProgram.find((p: { program: { id: number } }) => p.program.id === programId);
      expect(row.skillsGapNotes).toHaveLength(20);
      // Newest first — the oldest note (note 0) is the one dropped.
      expect(row.skillsGapNotes.map((n: { note: string }) => n.note)).not.toContain("note 0");
    });
  });
});
