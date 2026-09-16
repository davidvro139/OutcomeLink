import ExcelJS from "exceljs";
import request from "supertest";
import { createApp } from "../../app";
import { computeReportingPeriod } from "./calculators/cplCalculator";
import { runValidation } from "./validators/validationEngine";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import { runWithRequestContext } from "../../lib/requestContext";

const app = createApp();

/**
 * Excel exports (Phase 2 P7, docs/TODO.md): reads the actual returned
 * workbook back with exceljs rather than just checking response headers, to
 * confirm the file is a genuinely valid, correctly-populated .xlsx — not
 * just that *something* with the right Content-Type came back.
 */
describe("excel exports (integration)", () => {
  let institutionId: number;
  let campusId: number;
  let programId: number;
  let reportingPeriodId: number;
  let userId: number;
  let adminToken: string;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Exports Test Institution" } });
    institutionId = institution.id;

    const campus = await prisma.campus.create({ data: { institutionId, name: "Main Campus" } });
    campusId = campus.id;

    const program = await prisma.program.create({
      data: { institutionId, campusId, name: "HVAC Technology", code: "HVAC-100", credentialType: "Diploma" },
    });
    programId = program.id;

    const passwordHash = await hashPassword("password123");
    const admin = await prisma.user.create({
      data: { institutionId, name: "Admin", email: "admin@exports-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    userId = admin.id;
    const adminLogin = await request(app).post("/api/auth/login").send({ email: "admin@exports-test.edu", password: "password123" });
    adminToken = adminLogin.body.data.accessToken;

    const framework = await prisma.accreditationFramework.create({ data: { name: "COE-EXPORTS-TEST" } });
    const ruleSet = await prisma.ruleSet.create({
      data: {
        frameworkId: framework.id,
        versionLabel: "COE-2026-EXPORTS-TEST",
        effectiveStartDate: new Date("2025-01-01"),
        ruleDefinition: { benchmarks: { completion: 60, placement: 70, licensure: 70 } },
      },
    });
    const period = await prisma.reportingPeriod.create({
      data: { institutionId, ruleSetId: ruleSet.id, label: "EXPORTS-TEST-PERIOD", startDate: new Date("2025-07-01"), endDate: new Date("2026-06-30") },
    });
    reportingPeriodId = period.id;

    const student = await prisma.student.create({
      data: { institutionId, internalStudentId: "EXPORT-1", firstName: "Export", lastName: "Testcase", email: "export.testcase@example.com" },
    });
    await prisma.studentEnrollment.create({
      data: {
        studentId: student.id,
        programId,
        campusId,
        startDate: new Date("2025-01-01"),
        actualCompletionDate: new Date("2026-01-15"),
        enrollmentStatus: "WITHDRAWN",
      },
    });

    await runWithRequestContext({ userId }, () => computeReportingPeriod(reportingPeriodId));
    await runValidation(reportingPeriodId);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function loadWorkbookFromResponse(res: request.Response): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    // exceljs's own Buffer type declaration doesn't quite line up with the
    // installed @types/node version's Buffer generic — a type-only mismatch,
    // not a real one, since res.body is a genuine Node Buffer at runtime.
    await workbook.xlsx.load(res.body as unknown as ExcelJS.Buffer);
    return workbook;
  }

  it("rejects the CPL results export without authentication", async () => {
    const res = await request(app).get(`/api/accreditation/reporting-periods/${reportingPeriodId}/results/export`);
    expect(res.status).toBe(401);
  });

  it("exports CPL results as a real, readable .xlsx with the expected columns and a data row", async () => {
    const res = await request(app)
      .get(`/api/accreditation/reporting-periods/${reportingPeriodId}/results/export`)
      .set("Authorization", `Bearer ${adminToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    expect(res.headers["content-disposition"]).toContain("cpl-results-EXPORTS-TEST-PERIOD.xlsx");

    const workbook = await loadWorkbookFromResponse(res);
    const sheet = workbook.getWorksheet("CPL Results");
    expect(sheet).toBeDefined();
    const headerRow = sheet!.getRow(1).values as unknown[];
    expect(headerRow.slice(1)).toEqual(["Program", "Metric", "Numerator", "Denominator", "Percentage"]);

    const completionRow = sheet!
      .getRows(2, sheet!.rowCount - 1)!
      .find((row) => row.getCell(1).value === "HVAC Technology" && row.getCell(2).value === "COMPLETION");
    expect(completionRow).toBeDefined();
    expect(completionRow!.getCell(4).value).toBe(1); // 1 withdrawal in the denominator, 0 numerator
  });

  it("exports validation issues as a real .xlsx with a real issue row", async () => {
    const res = await request(app)
      .get(`/api/accreditation/reporting-periods/${reportingPeriodId}/validation-issues/export`)
      .set("Authorization", `Bearer ${adminToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    const workbook = await loadWorkbookFromResponse(res);
    const sheet = workbook.getWorksheet("Validation Issues");
    expect(sheet).toBeDefined();
    const rows = sheet!.getRows(2, sheet!.rowCount - 1) ?? [];
    const studentRow = rows.find((row) => row.getCell(3).value === "Export Testcase");
    expect(studentRow).toBeDefined();
    expect(studentRow!.getCell(1).value).toBe("MISSING_OUTCOME_RECORD");
  });

  it("exports the student roster as a real .xlsx with the seeded student's data", async () => {
    const res = await request(app)
      .get("/api/students/export")
      .set("Authorization", `Bearer ${adminToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("students.xlsx");
    const workbook = await loadWorkbookFromResponse(res);
    const sheet = workbook.getWorksheet("Students");
    expect(sheet).toBeDefined();
    const rows = sheet!.getRows(2, sheet!.rowCount - 1) ?? [];
    const studentRow = rows.find((row) => row.getCell(1).value === "EXPORT-1");
    expect(studentRow).toBeDefined();
    expect(studentRow!.getCell(4).value).toBe("export.testcase@example.com");
  });
});
