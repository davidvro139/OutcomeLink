import { prisma } from "../../lib/prisma";
import { buildEquityBreakdown } from "./equityBreakdown";

describe("equityBreakdown", () => {
  let institutionId: number;
  let programId: number;
  let reportingPeriodId: number;
  let campusId: number;
  let ruleSetId: number;

  beforeAll(async () => {
    // Create test institution
    const institution = await prisma.institution.create({
      data: { name: "Test Institution" },
    });
    institutionId = institution.id;

    // Create test campus first
    const campus = await prisma.campus.create({
      data: { institutionId, name: "Main" },
    });
    campusId = campus.id;

    // Create test program
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

    // Create accreditation framework and rule set
    const framework = await prisma.accreditationFramework.create({
      data: { name: `TEST-EQUITY-FW-${Date.now()}` },
    });
    const ruleSet = await prisma.ruleSet.create({
      data: {
        frameworkId: framework.id,
        versionLabel: "2024",
        effectiveStartDate: new Date("2024-01-01"),
        ruleDefinition: { benchmarks: { completion: 70, placement: 75, licensure: 80 } },
      },
    });
    ruleSetId = ruleSet.id;

    // Create reporting period
    const reportingPeriod = await prisma.reportingPeriod.create({
      data: {
        institutionId,
        label: "2024-2025",
        startDate: new Date("2024-01-01"),
        endDate: new Date("2025-01-01"),
        ruleSetId: ruleSet.id,
      },
    });
    reportingPeriodId = reportingPeriod.id;

    // Create students with demographics
    for (let i = 0; i < 20; i++) {
      const student = await prisma.student.create({
        data: {
          institutionId,
          internalStudentId: `TEST-${i}`,
          firstName: `Student${i}`,
          lastName: "Test",
        },
      });

      // Add demographics to ~75% of students
      if (i < 15) {
        await prisma.studentDemographics.create({
          data: {
            studentId: student.id,
            gender: i % 2 === 0 ? "MALE" : "FEMALE",
            raceEthnicity: i % 3 === 0 ? "WHITE" : "HISPANIC_LATINO",
          },
        });
      }

      // Create enrollment
      const enrollment = await prisma.studentEnrollment.create({
        data: {
          studentId: student.id,
          programId,
          campusId,
          enrollmentStatus: "GRADUATE_COMPLETER",
          startDate: new Date("2023-01-01"),
          actualCompletionDate: new Date("2024-06-01"),
        },
      });

      // Create classification with explanation (50% in numerator)
      await prisma.studentClassification.create({
        data: {
          studentEnrollmentId: enrollment.id,
          reportingPeriodId,
          metric: "COMPLETION",
          classificationCode: "CODE",
          determinedByRuleSetId: ruleSetId,
          explanation: {
            create: {
              countsInDenominator: true,
              countsInNumerator: i < 10,
              reasonText: "Test classification",
            },
          },
        },
      });
    }
  });

  afterAll(async () => {
    // The integration harness resets the disposable database before the next run.
    await prisma.$disconnect();
  });

  it("should aggregate by entry year", async () => {
    const result = await buildEquityBreakdown(institutionId, [programId], {
      metric: "COMPLETION",
      dimension: "entryYear",
    });

    expect(result.dimension).toBe("entryYear");
    expect(result.groups.length).toBeGreaterThan(0);
    expect(result.groups[0]).toHaveProperty("label");
    expect(result.groups[0]).toHaveProperty("denominator");
    expect(result.groups[0]).toHaveProperty("numerator");
  });

  it("should apply small-cell suppression at threshold 10", async () => {
    const result = await buildEquityBreakdown(institutionId, [programId], {
      metric: "COMPLETION",
      dimension: "gender",
    });

    const suppressedGroups = result.groups.filter((g) => g.suppressed);
    suppressedGroups.forEach((g) => {
      expect(g.denominator).toBeLessThan(10);
      expect(g.numerator).toBeNull();
      expect(g.percentage).toBeNull();
      expect(g.status).toBe("SUPPRESSED");
    });
  });

  it("should track coverage for demographic dimensions", async () => {
    const result = await buildEquityBreakdown(institutionId, [programId], {
      metric: "COMPLETION",
      dimension: "gender",
    });

    expect(result.coverage).toBeDefined();
    if (result.coverage) {
      expect(result.coverage.totalDenominator).toBe(20);
      expect(result.coverage.withDataOnFile).toBeLessThanOrEqual(
        result.coverage.totalDenominator
      );
    }
  });

  it("should include NOT_ON_FILE bucket for missing demographics", async () => {
    const result = await buildEquityBreakdown(institutionId, [programId], {
      metric: "COMPLETION",
      dimension: "gender",
    });

    const notOnFileGroup = result.groups.find((g) => g.value === "NOT_ON_FILE");
    expect(notOnFileGroup).toBeDefined();
    expect(notOnFileGroup?.denominator).toBe(5); // 20 - 15 with data
  });

  it("should calculate percentage correctly for unsuppressed groups", async () => {
    const result = await buildEquityBreakdown(institutionId, [programId], {
      metric: "COMPLETION",
      dimension: "entryYear",
    });

    result.groups.forEach((group) => {
      if (!group.suppressed && group.denominator > 0) {
        const expectedPercentage =
          (group.numerator! / group.denominator) * 100;
        expect(Math.abs(group.percentage! - expectedPercentage)).toBeLessThan(
          0.01
        );
      }
    });
  });

  it("should return empty result for period with no classifications", async () => {
    // Create a new empty period
    const emptyPeriod = await prisma.reportingPeriod.create({
      data: {
        institutionId,
        label: "2025-2026",
        startDate: new Date("2025-01-01"),
        endDate: new Date("2026-01-01"),
        ruleSetId,
      },
    });

    const result = await buildEquityBreakdown(institutionId, [programId], {
      metric: "COMPLETION",
      dimension: "entryYear",
      reportingPeriodId: emptyPeriod.id,
    });

    expect(result.groups).toHaveLength(0);
    expect(result.period?.id).toBe(emptyPeriod.id);
  });

  it("should respect program access scope", async () => {
    // Only accessible to this program
    const result = await buildEquityBreakdown(institutionId, [programId], {
      metric: "COMPLETION",
      dimension: "entryYear",
    });

    expect(result.scope.programId).toBe(programId);
  });

  it("returns no classifications or trend data for an empty access scope", async () => {
    const result = await buildEquityBreakdown(institutionId, [], { reportingPeriodId, metric: "COMPLETION", dimension: "gender" });
    expect(result.groups).toEqual([]);
    expect(result.trend).toEqual([]);
  });

  it("keeps false demographic values separate from missing data and preserves trend order", async () => {
    await prisma.studentDemographics.updateMany({ where: { student: { institutionId } }, data: { disabilityStatus: false } });
    const result = await buildEquityBreakdown(institutionId, [programId], { reportingPeriodId, metric: "COMPLETION", dimension: "disabilityStatus" });
    expect(result.groups.find((g) => g.value === "false")?.denominator).toBe(15);
    expect(result.groups.find((g) => g.value === "false")?.label).toBe("No");
    expect(result.groups.find((g) => g.value === "NOT_ON_FILE")?.label).toBe("Not on file");
    expect(result.groups.find((g) => g.value === "NOT_ON_FILE")?.denominator).toBe(5);
    expect(result.benchmark?.value).toBe(70);
    expect(result.trend[0]?.points.map((p) => p.label)).toEqual(result.trend[1]?.points.map((p) => p.label));
  });

  it("sums one program's groups to that program's official CPL result for each metric", async () => {
    const enrollments = await prisma.studentEnrollment.findMany({
      where: { programId },
      include: { student: { select: { internalStudentId: true } } },
    });
    for (const enrollment of enrollments) {
      const index = Number(enrollment.student.internalStudentId.replace("TEST-", ""));
      for (const metric of ["PLACEMENT", "LICENSURE"] as const) {
        await prisma.studentClassification.create({
          data: {
            studentEnrollmentId: enrollment.id,
            reportingPeriodId,
            metric,
            classificationCode: "CODE",
            determinedByRuleSetId: ruleSetId,
            explanation: {
              create: {
                countsInDenominator: true,
                countsInNumerator: metric === "PLACEMENT" ? index < 12 : index < 16,
                reasonText: "Test classification",
              },
            },
          },
        });
      }
    }

    for (const metric of ["COMPLETION", "PLACEMENT", "LICENSURE"] as const) {
      const explanations = await prisma.cplCalculationExplanation.findMany({
        where: { studentClassification: { reportingPeriodId, metric, studentEnrollment: { programId } } },
        select: { countsInNumerator: true, countsInDenominator: true },
      });
      const numerator = explanations.filter((row) => row.countsInNumerator).length;
      const denominator = explanations.filter((row) => row.countsInDenominator).length;
      await prisma.cplCalculationResult.create({
        data: {
          programId,
          reportingPeriodId,
          metric,
          numerator,
          denominator,
          percentage: denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : 0,
        },
      });

      const byYear = await buildEquityBreakdown(institutionId, [programId], {
        reportingPeriodId,
        metric,
        dimension: "entryYear",
        programId,
      });
      expect(byYear.groups.reduce((sum, group) => sum + group.denominator, 0)).toBe(denominator);
      expect(byYear.groups.reduce((sum, group) => sum + (group.numerator ?? 0), 0)).toBe(numerator);
      expect(byYear.groups.every((group) => !group.suppressed)).toBe(true);

      const byGender = await buildEquityBreakdown(institutionId, [programId], {
        reportingPeriodId,
        metric,
        dimension: "gender",
        programId,
      });
      expect(byGender.groups.find((group) => group.value === "MALE")?.label).toBe("Male");
      expect(byGender.groups.find((group) => group.value === "FEMALE")?.label).toBe("Female");
      expect(byGender.groups.reduce((sum, group) => sum + group.denominator, 0)).toBe(denominator);
      expect(byGender.groups.every((group) => group.suppressed && group.numerator === null)).toBe(true);
    }
  });

  it("should throw on inaccessible program", async () => {
    await expect(
      buildEquityBreakdown(institutionId, [999], {
        metric: "COMPLETION",
        dimension: "entryYear",
        programId: programId,
      })
    ).rejects.toThrow("not accessible");
  });
});
