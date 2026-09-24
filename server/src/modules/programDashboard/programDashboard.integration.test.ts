import ExcelJS from "exceljs";
import request from "supertest";
import { createApp } from "../../app";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import { runWithRequestContext } from "../../lib/requestContext";
import { computeReportingPeriod } from "../accreditation/calculators/cplCalculator";
import { alertAtRiskPrograms } from "./atRiskJob";

const app = createApp();
const DAY = 24 * 60 * 60 * 1000;

interface MetricJson {
  status: string;
  needed: number | null;
  percentage: number;
  benchmark: number;
  negotiated: boolean;
  pools: { numeratorOnly: number; both: number };
}
interface ProgramJson {
  programId: number;
  name: string;
  status: string;
  metrics: Record<string, MetricJson | undefined>;
  trend: Record<string, { label: string; percentage: number | null; benchmark: number | null }[]>;
}

/**
 * Program dashboard (docs/TODO.md): stored results -> per-program status, with
 * "at risk" meaning below the benchmark but still reachable by the students who
 * can move the rate, scoped to a Program Administrator's programs.
 */
describe("program dashboard (integration)", () => {
  let institutionId: number;
  let campusId: number;
  let programAId: number; // placement 5/10 = 50%, five seeking -> AT_RISK
  let programBId: number; // placement 2/10 = 20%, nobody left to move it -> OFF_TRACK
  let periodId: number;
  let sysAdminId: number;
  let programAdminId: number;
  let sysToken: string;
  let programAdminToken: string;
  let unassignedToken: string;
  let careerToken: string;
  let otherAdminToken: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const dashboard = (token: string, query = "") => request(app).get(`/api/dashboard/programs${query}`).set(auth(token));
  const programs = (body: { data: { programs: ProgramJson[] } }) => body.data.programs;

  beforeAll(async () => {
    institutionId = (await prisma.institution.create({ data: { name: "Dashboard Test College" } })).id;
    const otherInstitutionId = (await prisma.institution.create({ data: { name: "Other Dashboard College" } })).id;
    campusId = (await prisma.campus.create({ data: { institutionId, name: "Main" } })).id;
    programAId = (await prisma.program.create({ data: { institutionId, campusId, name: "Automotive", code: "DB-AUTO", credentialType: "Diploma" } })).id;
    programBId = (await prisma.program.create({ data: { institutionId, campusId, name: "Welding", code: "DB-WELD", credentialType: "Diploma" } })).id;

    const passwordHash = await hashPassword("password123");
    const make = (inst: number, email: string, role: "SYSTEM_ADMINISTRATOR" | "PROGRAM_ADMINISTRATOR" | "CAREER_SERVICES_STAFF" | "INSTITUTIONAL_ADMINISTRATOR") =>
      prisma.user.create({ data: { institutionId: inst, name: email, email, passwordHash, role } });
    sysAdminId = (await make(institutionId, "sys@dashboard-test.edu", "SYSTEM_ADMINISTRATOR")).id;
    programAdminId = (await make(institutionId, "pa@dashboard-test.edu", "PROGRAM_ADMINISTRATOR")).id;
    await make(institutionId, "nobody@dashboard-test.edu", "PROGRAM_ADMINISTRATOR");
    await make(institutionId, "career@dashboard-test.edu", "CAREER_SERVICES_STAFF");
    await make(otherInstitutionId, "admin@other-dashboard-test.edu", "INSTITUTIONAL_ADMINISTRATOR");
    await prisma.userProgramAccess.create({ data: { userId: programAdminId, programId: programAId } });

    const login = async (email: string) =>
      (await request(app).post("/api/auth/login").send({ email, password: "password123" })).body.data.accessToken as string;
    sysToken = await login("sys@dashboard-test.edu");
    programAdminToken = await login("pa@dashboard-test.edu");
    unassignedToken = await login("nobody@dashboard-test.edu");
    careerToken = await login("career@dashboard-test.edu");
    otherAdminToken = await login("admin@other-dashboard-test.edu");

    const framework = await prisma.accreditationFramework.create({ data: { name: "COE-DASHBOARD-TEST" } });
    const ruleSet = await prisma.ruleSet.create({
      data: {
        frameworkId: framework.id,
        versionLabel: "COE-2026-DASHBOARD-TEST",
        effectiveStartDate: new Date("2025-01-01"),
        ruleDefinition: { benchmarks: { completion: 60, placement: 70, licensure: 70 } },
      },
    });
    // The period's window has to contain "now" for active students to count as expected to finish inside it.
    periodId = (
      await prisma.reportingPeriod.create({
        data: {
          institutionId,
          ruleSetId: ruleSet.id,
          label: "DB-PERIOD",
          startDate: new Date("2025-07-01"),
          endDate: new Date("2026-06-30"),
        },
      })
    ).id;

    async function completer(programId: number, label: string, outcome: "related" | "unrelated" | "unknown") {
      const student = await prisma.student.create({ data: { institutionId, internalStudentId: `DB-${label}`, firstName: label, lastName: "Student" } });
      const enrollment = await prisma.studentEnrollment.create({
        data: {
          studentId: student.id,
          programId,
          campusId,
          startDate: new Date("2025-01-01"),
          actualCompletionDate: new Date("2026-01-01"),
          enrollmentStatus: "GRADUATE_COMPLETER",
        },
      });
      await prisma.studentOutcomeRecord.create({
        data: {
          studentEnrollmentId: enrollment.id,
          reportingPeriodId: periodId,
          licensureRequired: false,
          employmentStatus: outcome === "unknown" ? "UNKNOWN" : "EMPLOYED",
          ...(outcome === "unknown"
            ? {}
            : {
                relatedToTraining: outcome === "related",
                ...(outcome === "related" ? { relatedToTrainingJustification: "Matches curriculum." } : {}),
                verificationStatus: "VERIFIED" as const,
              }),
        },
      });
    }
    for (let i = 0; i < 5; i++) await completer(programAId, `A-rel-${i}`, "related");
    for (let i = 0; i < 5; i++) await completer(programAId, `A-unk-${i}`, "unknown");
    for (let i = 0; i < 2; i++) await completer(programBId, `B-rel-${i}`, "related");
    for (let i = 0; i < 8; i++) await completer(programBId, `B-unrel-${i}`, "unrelated");

    // Two current students in program B who are expected to finish inside the period.
    for (let i = 0; i < 2; i++) {
      const student = await prisma.student.create({ data: { institutionId, internalStudentId: `DB-B-active-${i}`, firstName: `Active${i}`, lastName: "Student" } });
      await prisma.studentEnrollment.create({
        data: { studentId: student.id, programId: programBId, campusId, startDate: new Date("2026-01-01"), expectedCompletionDate: new Date("2026-05-01"), enrollmentStatus: "ACTIVE" },
      });
    }

    await runWithRequestContext({ userId: sysAdminId }, () => computeReportingPeriod(periodId));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("assesses each program from the stored results, worst first, with the numbers behind the status", async () => {
    const res = await dashboard(sysToken, `?reportingPeriodId=${periodId}`);
    expect(res.status).toBe(200);
    const [first, second] = programs(res.body);
    expect(first).toMatchObject({ name: "Welding", status: "OFF_TRACK" });
    expect(second).toMatchObject({ name: "Automotive", status: "AT_RISK" });

    const autoPlacement = second!.metrics["PLACEMENT"]!;
    expect(autoPlacement).toMatchObject({ percentage: 50, benchmark: 70, negotiated: false, status: "AT_RISK", needed: 2 });
    expect(autoPlacement.pools.numeratorOnly).toBe(5);
    expect(second!.metrics["COMPLETION"]).toMatchObject({ status: "MEETING", percentage: 100 });
    expect(second!.metrics["LICENSURE"]).toMatchObject({ status: "NO_DATA" }); // no licensure-required completers

    const weldPlacement = first!.metrics["PLACEMENT"]!;
    expect(weldPlacement).toMatchObject({ status: "OFF_TRACK", needed: null });
    expect(weldPlacement.percentage).toBeLessThan(70);
    expect(first!.metrics["COMPLETION"]!.pools.both).toBe(2); // the two current students expected to complete in the period

    expect(res.body.data.summary).toMatchObject({ OFF_TRACK: 1, AT_RISK: 1 });
    expect(res.body.data.freshness).toMatchObject({ neverComputed: false });
    expect(res.body.data.freshness.computedAt).toBeTruthy();
    expect(res.body.data.attention.map((a: { severity: number }) => a.severity)).toEqual(
      [...res.body.data.attention.map((a: { severity: number }) => a.severity)].sort((a: number, b: number) => b - a),
    );
  });

  it("gives the trend for each metric with the benchmark that applied, and defaults to the newest open period", async () => {
    const res = await dashboard(sysToken); // no period given
    expect(res.body.data.period.id).toBe(periodId);
    const auto = programs(res.body).find((p) => p.name === "Automotive")!;
    expect(auto.trend["PLACEMENT"]).toEqual([{ reportingPeriodId: periodId, label: "DB-PERIOD", percentage: 50, benchmark: 70 }]);
  });

  it("scopes a Program Administrator to their programs, and shows nothing to one with no assignments", async () => {
    const scoped = programs((await dashboard(programAdminToken, `?reportingPeriodId=${periodId}`)).body);
    expect(scoped.map((p) => p.name)).toEqual(["Automotive"]);

    const none = await dashboard(unassignedToken, `?reportingPeriodId=${periodId}`);
    expect(programs(none.body)).toEqual([]);

    // Roles that aren't program-scoped see every program.
    expect(programs((await dashboard(careerToken, `?reportingPeriodId=${periodId}`)).body)).toHaveLength(2);
  });

  it("does not show another institution's period", async () => {
    expect((await dashboard(otherAdminToken, `?reportingPeriodId=${periodId}`)).status).toBe(404);
  });

  it("applies a negotiated benchmark for the period", async () => {
    const negotiated = await prisma.negotiatedBenchmark.create({
      data: { programId: programAId, metric: "PLACEMENT", approvedPercentage: 50, effectiveStartDate: new Date("2025-01-01"), approvalReference: "COE letter", createdBy: "test" },
    });
    try {
      const auto = programs((await dashboard(sysToken, `?reportingPeriodId=${periodId}`)).body).find((p) => p.name === "Automotive")!;
      expect(auto.metrics["PLACEMENT"]).toMatchObject({ benchmark: 50, negotiated: true, status: "MEETING" });
    } finally {
      await prisma.negotiatedBenchmark.delete({ where: { id: negotiated.id } });
    }
  });

  it("counts down to the outcomes deadline", async () => {
    await prisma.reportingPeriod.update({ where: { id: periodId }, data: { outcomesDeadline: new Date(Date.now() + 10 * DAY - 60_000) } });
    const res = await dashboard(sysToken, `?reportingPeriodId=${periodId}`);
    expect(res.body.data.period.daysUntilOutcomesDeadline).toBe(10);
  });

  it("flags a period whose results were never computed", async () => {
    const fresh = await prisma.reportingPeriod.create({
      data: {
        institutionId,
        ruleSetId: (await prisma.reportingPeriod.findUniqueOrThrow({ where: { id: periodId } })).ruleSetId,
        label: "DB-EMPTY",
        startDate: new Date("2026-07-01"),
        endDate: new Date("2027-06-30"),
      },
    });
    const res = await dashboard(sysToken, `?reportingPeriodId=${fresh.id}`);
    expect(res.body.data.freshness.neverComputed).toBe(true);
    expect(res.body.data.attention[0]).toMatchObject({ severity: 3 });
    expect(res.body.data.attention[0].message).toContain("not been computed");
  });

  describe("recompute now", () => {
    const recompute = (token: string, id = periodId) => request(app).post(`/api/dashboard/programs/recompute?reportingPeriodId=${id}`).set(auth(token));

    it("is closed to roles that can't act on the data", async () => {
      expect((await recompute(careerToken)).status).toBe(403);
    });

    it("is refused when the period was computed a moment ago", async () => {
      const res = await recompute(programAdminToken);
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe("RECOMPUTE_TOO_SOON");
    });

    it("lets a Program Administrator refresh the stored results, as a tracked job, once they are old enough", async () => {
      await prisma.cplCalculationResult.updateMany({ where: { reportingPeriodId: periodId }, data: { computedAt: new Date(Date.now() - 10 * 60_000) } });
      const res = await recompute(programAdminToken);
      expect(res.status).toBe(201);
      expect(res.body.data.freshness.ageDays).toBe(0);
      const run = await prisma.jobRun.findFirstOrThrow({ where: { institutionId, jobType: "CPL_RECOMPUTE" }, orderBy: { id: "desc" } });
      expect(run).toMatchObject({ trigger: "MANUAL", requestedBy: programAdminId, status: "SUCCESS" });
      // ...and immediately again is throttled.
      expect((await recompute(programAdminToken)).status).toBe(429);
    });

    it("refuses a finalized period", async () => {
      const finalized = await prisma.reportingPeriod.create({
        data: {
          institutionId,
          ruleSetId: (await prisma.reportingPeriod.findUniqueOrThrow({ where: { id: periodId } })).ruleSetId,
          label: "DB-FINAL",
          startDate: new Date("2020-07-01"),
          endDate: new Date("2021-06-30"),
          status: "FINALIZED",
        },
      });
      expect((await recompute(sysToken, finalized.id)).status).toBe(409);
    });
  });

  it("exports the visible programs with a provenance sheet", async () => {
    const res = await request(app)
      .get(`/api/dashboard/programs/export?reportingPeriodId=${periodId}`)
      .set(auth(programAdminToken))
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.worksheets.map((w) => w.name)).toEqual(["Programs", "Report Info"]);
    const sheet = workbook.getWorksheet("Programs")!;
    expect(sheet.rowCount).toBe(2); // header + the one program this administrator can see
    expect(sheet.getRow(2).getCell(1).value).toBe("Automotive");
    expect(sheet.getRow(2).getCell(3).value).toBe("At risk");
  });

  describe("at-risk alerts", () => {
    const notesFor = (userId: number) => prisma.notification.findMany({ where: { userId, type: "PROGRAM_AT_RISK" } });

    it("alerts the right people once per program, metric and kind — and again as the deadline gets close", async () => {
      // Deadline is ~10 days out (set above): the off-track program alerts now, the recoverable one at the 30-day mark.
      const first = await alertAtRiskPrograms(institutionId);
      expect(first.alerts).toBe(2);

      const kinds = (await prisma.atRiskAlert.findMany({ where: { reportingPeriodId: periodId } })).map((a) => `${a.programId}:${a.metric}:${a.kind}`).sort();
      expect(kinds).toEqual([`${programAId}:PLACEMENT:AT_RISK_30`, `${programBId}:PLACEMENT:OFF_TRACK`].sort());

      // Program A's administrator hears about A only; nobody is assigned to B, so B falls back to the institution's administrators.
      const paNotes = await notesFor(programAdminId);
      expect(paNotes).toHaveLength(1);
      expect(paNotes[0]!.message).toContain("Automotive");
      const sysNotes = await notesFor(sysAdminId);
      expect(sysNotes.map((n) => n.message).join(" ")).toContain("Welding");
      expect(sysNotes.map((n) => n.message).join(" ")).not.toContain("Automotive");

      // Re-running sends nothing new.
      expect((await alertAtRiskPrograms(institutionId)).alerts).toBe(0);
      expect(await notesFor(programAdminId)).toHaveLength(1);

      // Inside the last week, the recoverable metric alerts again (a different kind).
      await prisma.reportingPeriod.update({ where: { id: periodId }, data: { outcomesDeadline: new Date(Date.now() + 5 * DAY) } });
      expect((await alertAtRiskPrograms(institutionId)).alerts).toBe(1);
      expect((await notesFor(programAdminId)).map((n) => n.message).join(" ")).toContain("5 days");
    });

    it("only alerts about a recoverable metric when there is an outcomes deadline to be near", async () => {
      await prisma.atRiskAlert.deleteMany({ where: { reportingPeriodId: periodId } });
      await prisma.reportingPeriod.update({ where: { id: periodId }, data: { outcomesDeadline: null } });
      const result = await alertAtRiskPrograms(institutionId);
      expect(result.alerts).toBe(1); // only Welding's OFF_TRACK
      expect((await prisma.atRiskAlert.findMany({ where: { reportingPeriodId: periodId } })).map((a) => a.kind)).toEqual(["OFF_TRACK"]);
    });
  });
});
