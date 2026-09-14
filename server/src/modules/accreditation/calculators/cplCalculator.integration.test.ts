import { computeReportingPeriod } from "./cplCalculator";
import { prisma } from "../../../lib/prisma";
import { runWithRequestContext } from "../../../lib/requestContext";

/**
 * Formalizes the 9-scenario hand-computed verification originally run ad hoc
 * against the dev database while building the calculator (see docs/TODO.md
 * stage 4) into a permanent, repeatable test — one per classification branch
 * documented in docs/COE_RULE_MATRIX.md, plus boundary conditions and
 * idempotency that a pure unit test on the classifier alone can't cover
 * (those need real persistence and aggregation).
 */
describe("computeReportingPeriod (integration)", () => {
  let institutionId: number;
  let programId: number;
  let campusId: number;
  let reportingPeriodId: number;
  let userId: number;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Calculator Test Institution" } });
    institutionId = institution.id;

    const campus = await prisma.campus.create({ data: { institutionId, name: "Main Campus" } });
    campusId = campus.id;

    const program = await prisma.program.create({
      data: { institutionId, campusId, name: "Software Development", code: "SD-100", credentialType: "Diploma" },
    });
    programId = program.id;

    const user = await prisma.user.create({
      data: {
        institutionId,
        name: "Test Admin",
        email: "admin@calculator-test.edu",
        passwordHash: "irrelevant-for-this-test",
        role: "SYSTEM_ADMINISTRATOR",
      },
    });
    userId = user.id;

    const framework = await prisma.accreditationFramework.create({ data: { name: "COE-CALC-TEST" } });
    const ruleSet = await prisma.ruleSet.create({
      data: {
        frameworkId: framework.id,
        versionLabel: "COE-2026-CALC-TEST",
        effectiveStartDate: new Date("2025-01-01"),
        ruleDefinition: { benchmarks: { completion: 60, placement: 70, licensure: 70 } },
      },
    });

    const period = await prisma.reportingPeriod.create({
      data: {
        institutionId,
        ruleSetId: ruleSet.id,
        label: "TEST-PERIOD",
        startDate: new Date("2025-07-01"),
        endDate: new Date("2026-06-30"),
      },
    });
    reportingPeriodId = period.id;

    // The nine documented classification scenarios, matching docs/COE_RULE_MATRIX.md.
    const scenarios: Array<{
      status: "GRADUATE_COMPLETER" | "NON_GRADUATE_COMPLETER" | "WITHDRAWN" | "ACTIVE";
      completionDate: string | null;
      outcome?: Record<string, unknown>;
      licensure?: "PASSED" | "WAITING";
    }> = [
      { status: "GRADUATE_COMPLETER", completionDate: "2026-01-15", outcome: { employmentStatus: "EMPLOYED", relatedToTraining: true } },
      { status: "GRADUATE_COMPLETER", completionDate: "2026-01-15", outcome: { employmentStatus: "EMPLOYED", relatedToTraining: false } },
      { status: "GRADUATE_COMPLETER", completionDate: "2026-01-15", outcome: { continuingEducationStatus: "ENROLLED" } },
      { status: "GRADUATE_COMPLETER", completionDate: "2026-01-15", outcome: { availabilityForEmploymentStatus: "UNAVAILABLE_HEALTH_OR_FAMILY" } },
      { status: "NON_GRADUATE_COMPLETER", completionDate: "2026-01-15" },
      { status: "WITHDRAWN", completionDate: "2026-01-15" },
      { status: "ACTIVE", completionDate: null },
      {
        status: "GRADUATE_COMPLETER",
        completionDate: "2026-01-15",
        outcome: { employmentStatus: "EMPLOYED", relatedToTraining: true, licensureRequired: true },
        licensure: "PASSED",
      },
      {
        status: "GRADUATE_COMPLETER",
        completionDate: "2026-01-15",
        outcome: { employmentStatus: "UNEMPLOYED", licensureRequired: true },
        licensure: "WAITING",
      },
    ];

    for (const [i, scenario] of scenarios.entries()) {
      const student = await prisma.student.create({
        data: { institutionId, internalStudentId: `CALC-${i}`, firstName: "Test", lastName: `Scenario${i}` },
      });
      const enrollment = await prisma.studentEnrollment.create({
        data: {
          studentId: student.id,
          programId,
          campusId,
          startDate: new Date("2025-01-01"),
          actualCompletionDate: scenario.completionDate ? new Date(scenario.completionDate) : null,
          enrollmentStatus: scenario.status,
        },
      });

      if (scenario.outcome) {
        await prisma.studentOutcomeRecord.create({
          data: { studentEnrollmentId: enrollment.id, reportingPeriodId, licensureRequired: false, ...scenario.outcome },
        });
      }

      if (scenario.licensure) {
        await prisma.licensureResult.create({
          data: { studentId: student.id, programId, examName: "Test Exam", result: scenario.licensure, attemptNumber: 1 },
        });
      }
    }

    await runWithRequestContext({ userId }, () => computeReportingPeriod(reportingPeriodId));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("computes Completion as 7/8 (all completers and the withdrawal in the denominator; the still-active student excluded)", async () => {
    const result = await prisma.cplCalculationResult.findFirst({ where: { reportingPeriodId, programId, metric: "COMPLETION" } });
    expect(result).toMatchObject({ numerator: 7, denominator: 8 });
    expect(Number(result!.percentage)).toBeCloseTo(87.5);
  });

  it("computes Placement as 4/5 (related-employed x1 + continuing-ed x1 + licensure-passed x1 = 3 numerator... plus non-graduate completer)", async () => {
    const result = await prisma.cplCalculationResult.findFirst({ where: { reportingPeriodId, programId, metric: "PLACEMENT" } });
    expect(result).toMatchObject({ numerator: 4, denominator: 5 });
    expect(Number(result!.percentage)).toBe(80);
  });

  it("computes Licensure as 1/1 (the awaiting-result student is excluded from both sides)", async () => {
    const result = await prisma.cplCalculationResult.findFirst({ where: { reportingPeriodId, programId, metric: "LICENSURE" } });
    expect(result).toMatchObject({ numerator: 1, denominator: 1 });
    expect(Number(result!.percentage)).toBe(100);
  });

  it("also aggregates an institution-wide rollup (programId null) with the same totals for a single-program institution", async () => {
    const result = await prisma.cplCalculationResult.findFirst({ where: { reportingPeriodId, programId: null, metric: "COMPLETION" } });
    expect(result).toMatchObject({ numerator: 7, denominator: 8 });
  });

  it("records determinedByRuleSetId on every classification, for traceability if the rule set later changes (spec §17)", async () => {
    const classifications = await prisma.studentClassification.findMany({ where: { reportingPeriodId } });
    expect(classifications.length).toBeGreaterThan(0);
    for (const c of classifications) {
      expect(c.determinedByRuleSetId).toEqual(expect.any(Number));
    }
  });

  it("persists a NOT_APPLICABLE classification (with an explanation) for the still-active student, not just a gap", async () => {
    const activeStudent = await prisma.student.findFirst({ where: { internalStudentId: "CALC-6" } });
    const enrollment = await prisma.studentEnrollment.findFirst({ where: { studentId: activeStudent!.id } });
    const classification = await prisma.studentClassification.findFirst({
      where: { studentEnrollmentId: enrollment!.id, reportingPeriodId, metric: "COMPLETION" },
      include: { explanation: true },
    });
    expect(classification?.classificationCode).toBe("NOT_APPLICABLE");
    expect(classification?.explanation?.reasonText).toBeTruthy();
  });

  it("is idempotent: recomputing produces the same aggregate numbers and no duplicate rows", async () => {
    await runWithRequestContext({ userId }, () => computeReportingPeriod(reportingPeriodId));

    const results = await prisma.cplCalculationResult.findMany({ where: { reportingPeriodId } });
    expect(results).toHaveLength(6); // 2 program scopes x 3 metrics

    const completion = results.find((r) => r.programId === programId && r.metric === "COMPLETION");
    expect(completion).toMatchObject({ numerator: 7, denominator: 8 });
  });
});
