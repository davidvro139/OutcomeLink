import request from "supertest";
import ExcelJS from "exceljs";
import { createApp } from "../../app";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";

const app = createApp();

describe("custom report builder (integration)", () => {
  let institutionId: number;
  let otherInstitutionId: number;
  let campusId: number;
  let autoProgramId: number;
  let nursingProgramId: number;
  let reportingPeriodId: number;
  let earlierReportingPeriodId: number;
  let adminToken: string;
  let auditorToken: string;
  let otherAdminToken: string;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Report Builder Test Institution" } });
    institutionId = institution.id;
    const otherInstitution = await prisma.institution.create({ data: { name: "Other Report Builder Institution" } });
    otherInstitutionId = otherInstitution.id;

    const campus = await prisma.campus.create({ data: { institutionId, name: "Main Campus" } });
    campusId = campus.id;
    const autoProgram = await prisma.program.create({
      data: { institutionId, campusId, name: "Automotive Technology", code: "RB-AUTO", credentialType: "Diploma" },
    });
    autoProgramId = autoProgram.id;
    const nursingProgram = await prisma.program.create({
      data: { institutionId, campusId, name: "Practical Nursing", code: "RB-NURSE", credentialType: "Certificate", licensureRequired: true },
    });
    nursingProgramId = nursingProgram.id;

    const employerA = await prisma.employer.create({
      data: { institutionId, name: "Acme Manufacturing", industry: "Manufacturing", state: "UT", active: true },
    });
    await prisma.employer.create({
      data: { institutionId, name: "Retired Corp", industry: "Manufacturing", state: "UT", active: false },
    });
    await prisma.employmentRecord.create({
      data: {
        studentId: (await prisma.student.create({ data: { institutionId, internalStudentId: "RB-EMP-PLACEHOLDER", firstName: "X", lastName: "Y" } })).id,
        employerId: employerA.id,
        jobTitle: "Technician",
        startDate: new Date("2026-01-01"),
        fullTime: true,
        relatedToTraining: true,
        salaryOrWage: 50000,
        employmentStatus: "EMPLOYED",
      },
    });
    await prisma.employmentRecord.create({
      data: {
        studentId: (await prisma.student.create({ data: { institutionId, internalStudentId: "RB-EMP-PLACEHOLDER2", firstName: "X", lastName: "Y" } })).id,
        employerId: employerA.id,
        jobTitle: "Technician II",
        startDate: new Date("2026-02-01"),
        fullTime: false,
        relatedToTraining: true,
        salaryOrWage: 40000,
        employmentStatus: "EMPLOYED",
      },
    });

    const passwordHash = await hashPassword("password123");
    await prisma.user.create({
      data: { institutionId, name: "Admin", email: "admin@report-builder-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    await prisma.user.create({
      data: { institutionId, name: "Auditor", email: "auditor@report-builder-test.edu", passwordHash, role: "READ_ONLY_AUDITOR" },
    });
    await prisma.user.create({
      data: { institutionId: otherInstitutionId, name: "Other Admin", email: "admin@other-report-builder-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    adminToken = (await request(app).post("/api/auth/login").send({ email: "admin@report-builder-test.edu", password: "password123" })).body.data.accessToken;
    auditorToken = (await request(app).post("/api/auth/login").send({ email: "auditor@report-builder-test.edu", password: "password123" })).body.data.accessToken;
    otherAdminToken = (await request(app).post("/api/auth/login").send({ email: "admin@other-report-builder-test.edu", password: "password123" })).body.data.accessToken;

    const framework = await prisma.accreditationFramework.create({ data: { name: "COE-REPORT-BUILDER-TEST" } });
    const ruleSet = await prisma.ruleSet.create({
      data: {
        frameworkId: framework.id,
        versionLabel: "COE-2026-REPORT-BUILDER-TEST",
        effectiveStartDate: new Date("2025-01-01"),
        ruleDefinition: { benchmarks: { completion: 60, placement: 70, licensure: 70 } },
      },
    });
    const period = await prisma.reportingPeriod.create({
      data: {
        institutionId,
        ruleSetId: ruleSet.id,
        label: "RB-TEST-PERIOD",
        startDate: new Date("2025-07-01"),
        endDate: new Date("2026-06-30"),
      },
    });
    reportingPeriodId = period.id;

    const earlierPeriod = await prisma.reportingPeriod.create({
      data: {
        institutionId,
        ruleSetId: ruleSet.id,
        label: "RB-TEST-PERIOD-EARLIER",
        startDate: new Date("2024-07-01"),
        endDate: new Date("2025-06-30"),
      },
    });
    earlierReportingPeriodId = earlierPeriod.id;

    await prisma.cplCalculationResult.create({
      data: { reportingPeriodId, programId: autoProgramId, metric: "COMPLETION", numerator: 3, denominator: 5, percentage: 60 },
    });
    await prisma.cplCalculationResult.create({
      data: { reportingPeriodId: earlierReportingPeriodId, programId: autoProgramId, metric: "COMPLETION", numerator: 4, denominator: 5, percentage: 80 },
    });

    // A placement attributed to the earlier period's date range only, so
    // Employer stats can be shown to differ per period rather than always
    // reflecting the same all-time total.
    await prisma.employmentRecord.create({
      data: {
        studentId: (await prisma.student.create({ data: { institutionId, internalStudentId: "RB-EMP-PLACEHOLDER3", firstName: "X", lastName: "Y" } })).id,
        employerId: employerA.id,
        jobTitle: "Technician III",
        startDate: new Date("2024-08-01"),
        fullTime: true,
        relatedToTraining: true,
        salaryOrWage: 60000,
        employmentStatus: "EMPLOYED",
      },
    });

    // Auto student with an EMPLOYED, verified outcome this period.
    const autoStudent = await prisma.student.create({
      data: { institutionId, internalStudentId: "RB-AUTO-1", firstName: "Auto", lastName: "Grad" },
    });
    const autoEnrollment = await prisma.studentEnrollment.create({
      data: { studentId: autoStudent.id, programId: autoProgramId, campusId, startDate: new Date("2025-01-01"), actualCompletionDate: new Date("2026-01-01"), enrollmentStatus: "GRADUATE_COMPLETER" },
    });
    await prisma.studentOutcomeRecord.create({
      data: { studentEnrollmentId: autoEnrollment.id, reportingPeriodId, licensureRequired: false, employmentStatus: "EMPLOYED", employerId: employerA.id, relatedToTraining: true, verificationStatus: "VERIFIED" },
    });

    // Nursing student, still active, no outcome record.
    const nursingStudent = await prisma.student.create({
      data: { institutionId, internalStudentId: "RB-NURSE-1", firstName: "Nursing", lastName: "Active" },
    });
    await prisma.studentEnrollment.create({
      data: { studentId: nursingStudent.id, programId: nursingProgramId, campusId, startDate: new Date("2025-01-01"), enrollmentStatus: "ACTIVE" },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("STUDENT entity", () => {
    it("rejects without authentication", async () => {
      const res = await request(app).post("/api/reports/custom/run").send({ entityType: "STUDENT", fields: ["internalStudentId"] });
      expect(res.status).toBe(401);
    });

    it("rejects an unknown field", async () => {
      const res = await request(app)
        .post("/api/reports/custom/run")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ entityType: "STUDENT", fields: ["notAField"] });
      expect(res.status).toBe(400);
    });

    it("rejects an outcome field without a reporting period", async () => {
      const res = await request(app)
        .post("/api/reports/custom/run")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ entityType: "STUDENT", fields: ["internalStudentId", "employmentStatus"] });
      expect(res.status).toBe(400);
    });

    it("returns basic fields with a program filter, scoped to the institution", async () => {
      const res = await request(app)
        .post("/api/reports/custom/run")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          entityType: "STUDENT",
          fields: ["internalStudentId", "programName"],
          filters: [{ field: "programId", value: [autoProgramId] }],
        });
      expect(res.status).toBe(200);
      expect(res.body.data.rows).toEqual([{ internalStudentId: "RB-AUTO-1", programName: "Automotive Technology" }]);
      expect(res.body.data.totalCount).toBe(1);
    });

    it("populates outcome fields with a reporting period and nulls them for a student with none", async () => {
      const res = await request(app)
        .post("/api/reports/custom/run")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          entityType: "STUDENT",
          fields: ["internalStudentId", "employmentStatus", "employerName"],
          reportingPeriodIds: [reportingPeriodId],
        });
      expect(res.status).toBe(200);
      const byId = new Map(res.body.data.rows.map((r: { internalStudentId: string }) => [r.internalStudentId, r]));
      expect(byId.get("RB-AUTO-1")).toMatchObject({ employmentStatus: "EMPLOYED", employerName: "Acme Manufacturing" });
      expect(byId.get("RB-NURSE-1")).toMatchObject({ employmentStatus: null, employerName: null });
    });

    it("applies the employmentStatus filter (JS-side, requires reporting period)", async () => {
      const res = await request(app)
        .post("/api/reports/custom/run")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          entityType: "STUDENT",
          fields: ["internalStudentId"],
          filters: [{ field: "employmentStatus", value: ["EMPLOYED"] }],
          reportingPeriodIds: [reportingPeriodId],
        });
      expect(res.status).toBe(200);
      expect(res.body.data.rows).toEqual([{ internalStudentId: "RB-AUTO-1" }]);
    });

    it("does not leak another institution's students", async () => {
      const res = await request(app)
        .post("/api/reports/custom/run")
        .set("Authorization", `Bearer ${otherAdminToken}`)
        .send({ entityType: "STUDENT", fields: ["internalStudentId"] });
      expect(res.body.data.totalCount).toBe(0);
    });
  });

  describe("EMPLOYER entity", () => {
    it("computes placement count, average wage, and full-time rate", async () => {
      const res = await request(app)
        .post("/api/reports/custom/run")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ entityType: "EMPLOYER", fields: ["name", "placementCount", "averageWage", "fullTimeRate"] });
      expect(res.status).toBe(200);
      const acme = res.body.data.rows.find((r: { name: string }) => r.name === "Acme Manufacturing");
      expect(acme).toMatchObject({ placementCount: 3, averageWage: 50000, fullTimeRate: 66.67 });
    });

    it("filters to active employers only", async () => {
      const res = await request(app)
        .post("/api/reports/custom/run")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ entityType: "EMPLOYER", fields: ["name"], filters: [{ field: "active", value: true }] });
      expect(res.body.data.rows.map((r: { name: string }) => r.name)).toEqual(["Acme Manufacturing"]);
    });
  });

  describe("PROGRAM entity", () => {
    it("rejects a CPL field without a reporting period", async () => {
      const res = await request(app)
        .post("/api/reports/custom/run")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ entityType: "PROGRAM", fields: ["name", "completionPercentage"] });
      expect(res.status).toBe(400);
    });

    it("returns the CPL completion percentage with a reporting period, and filters by credentialType", async () => {
      const res = await request(app)
        .post("/api/reports/custom/run")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          entityType: "PROGRAM",
          fields: ["name", "completionPercentage"],
          filters: [{ field: "credentialType", value: ["Diploma"] }],
          reportingPeriodIds: [reportingPeriodId],
        });
      expect(res.status).toBe(200);
      expect(res.body.data.rows).toEqual([{ name: "Automotive Technology", completionPercentage: 60 }]);
    });
  });

  describe("multi-period comparison", () => {
    it("with a single period, behaves exactly as before (no reportingPeriodLabel column)", async () => {
      const res = await request(app)
        .post("/api/reports/custom/run")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          entityType: "PROGRAM",
          fields: ["name", "completionPercentage"],
          filters: [{ field: "credentialType", value: ["Diploma"] }],
          reportingPeriodIds: [reportingPeriodId],
        });
      expect(res.status).toBe(200);
      expect(res.body.data.rows).toEqual([{ name: "Automotive Technology", completionPercentage: 60 }]);
    });

    it("concatenates rows across periods and tags each with reportingPeriodLabel", async () => {
      const res = await request(app)
        .post("/api/reports/custom/run")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          entityType: "PROGRAM",
          fields: ["name", "completionPercentage"],
          filters: [{ field: "credentialType", value: ["Diploma"] }],
          reportingPeriodIds: [reportingPeriodId, earlierReportingPeriodId],
        });
      expect(res.status).toBe(200);
      expect(res.body.data.totalCount).toBe(2);
      expect(res.body.data.rows).toEqual(
        expect.arrayContaining([
          { name: "Automotive Technology", completionPercentage: 60, reportingPeriodLabel: "RB-TEST-PERIOD" },
          { name: "Automotive Technology", completionPercentage: 80, reportingPeriodLabel: "RB-TEST-PERIOD-EARLIER" },
        ]),
      );
    });

    it("scopes Employer placement stats to each period's date range when periods are selected", async () => {
      const res = await request(app)
        .post("/api/reports/custom/run")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          entityType: "EMPLOYER",
          fields: ["name", "placementCount", "averageWage", "fullTimeRate"],
          filters: [{ field: "active", value: true }],
          reportingPeriodIds: [reportingPeriodId, earlierReportingPeriodId],
        });
      expect(res.status).toBe(200);
      const byLabel = new Map(
        res.body.data.rows.map((r: { reportingPeriodLabel: string }) => [r.reportingPeriodLabel, r]),
      );
      expect(byLabel.get("RB-TEST-PERIOD")).toMatchObject({ placementCount: 2, averageWage: 45000, fullTimeRate: 50 });
      expect(byLabel.get("RB-TEST-PERIOD-EARLIER")).toMatchObject({ placementCount: 1, averageWage: 60000, fullTimeRate: 100 });
    });

    it("still reports Employer's all-time stats when no period is selected", async () => {
      const res = await request(app)
        .post("/api/reports/custom/run")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ entityType: "EMPLOYER", fields: ["name", "placementCount"], filters: [{ field: "active", value: true }] });
      expect(res.status).toBe(200);
      expect(res.body.data.rows).toEqual([{ name: "Acme Manufacturing", placementCount: 3 }]);
    });

    it("rejects an unknown reportingPeriodId", async () => {
      const res = await request(app)
        .post("/api/reports/custom/run")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ entityType: "PROGRAM", fields: ["name"], reportingPeriodIds: [999999] });
      expect(res.status).toBe(400);
    });

    it("rejects more periods than REPORT_BUILDER_MAX_PERIODS", async () => {
      const res = await request(app)
        .post("/api/reports/custom/run")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ entityType: "PROGRAM", fields: ["name"], reportingPeriodIds: Array.from({ length: 11 }, (_, i) => i + 1) });
      expect(res.status).toBe(400);
    });

    it("exports with a Reporting Period column when comparing periods", async () => {
      const res = await request(app)
        .post("/api/reports/custom/export")
        .set("Authorization", `Bearer ${adminToken}`)
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => callback(null, Buffer.concat(chunks)));
        })
        .send({
          entityType: "PROGRAM",
          fields: ["name", "completionPercentage"],
          filters: [{ field: "credentialType", value: ["Diploma"] }],
          reportingPeriodIds: [reportingPeriodId, earlierReportingPeriodId],
        });

      expect(res.status).toBe(200);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(res.body as Parameters<typeof workbook.xlsx.load>[0]);
      const sheet = workbook.getWorksheet("Report")!;
      expect(sheet.getRow(1).getCell(1).value).toBe("Reporting Period");
      expect(sheet.getRow(1).getCell(2).value).toBe("Name");
    });
  });

  describe("export", () => {
    it("exports a real, readable .xlsx with the selected columns", async () => {
      const res = await request(app)
        .post("/api/reports/custom/export")
        .set("Authorization", `Bearer ${adminToken}`)
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => callback(null, Buffer.concat(chunks)));
        })
        .send({ entityType: "EMPLOYER", fields: ["name", "placementCount"], filters: [{ field: "active", value: true }] });

      expect(res.status).toBe(200);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(res.body as Parameters<typeof workbook.xlsx.load>[0]);
      const sheet = workbook.getWorksheet("Report")!;
      expect(sheet.getRow(1).getCell(1).value).toBe("Name");
      expect(sheet.getRow(2).getCell(1).value).toBe("Acme Manufacturing");
      expect(sheet.getRow(2).getCell(2).value).toBe(3);
    });
  });

  describe("saved reports", () => {
    it("rejects a Read-Only Auditor from saving a report", async () => {
      const res = await request(app)
        .post("/api/reports/custom/saved")
        .set("Authorization", `Bearer ${auditorToken}`)
        .send({ name: "Test Report", definition: { entityType: "STUDENT", fields: ["internalStudentId"] } });
      expect(res.status).toBe(403);
    });

    let savedReportId: number;

    it("saves a report definition", async () => {
      const res = await request(app)
        .post("/api/reports/custom/saved")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Auto Program Roster",
          definition: { entityType: "STUDENT", fields: ["internalStudentId", "programName"], filters: [{ field: "programId", value: [autoProgramId] }] },
        });
      expect(res.status).toBe(201);
      savedReportId = res.body.data.savedReport.id;

      const list = await request(app).get("/api/reports/custom/saved").set("Authorization", `Bearer ${auditorToken}`);
      expect(list.body.data.savedReports.map((r: { name: string }) => r.name)).toContain("Auto Program Roster");
    });

    it("re-saving the same name updates it instead of creating a duplicate", async () => {
      await request(app)
        .post("/api/reports/custom/saved")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Auto Program Roster",
          definition: { entityType: "STUDENT", fields: ["internalStudentId"] },
        });
      const list = await request(app).get("/api/reports/custom/saved").set("Authorization", `Bearer ${adminToken}`);
      const matching = list.body.data.savedReports.filter((r: { name: string }) => r.name === "Auto Program Roster");
      expect(matching).toHaveLength(1);
      expect(matching[0].definition.fields).toEqual(["internalStudentId"]);
    });

    it("deletes a saved report", async () => {
      const res = await request(app)
        .delete(`/api/reports/custom/saved/${savedReportId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);

      const list = await request(app).get("/api/reports/custom/saved").set("Authorization", `Bearer ${adminToken}`);
      expect(list.body.data.savedReports.map((r: { id: number }) => r.id)).not.toContain(savedReportId);
    });
  });
});
