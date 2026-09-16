import { coe2026Classifier } from "./coe2026";
import type { ClassifierContext } from "./types";

const PERIOD = { startDate: new Date("2025-07-01"), endDate: new Date("2026-06-30") };

function buildContext(overrides: Partial<ClassifierContext> = {}): ClassifierContext {
  return {
    enrollment: {
      enrollmentStatus: "ACTIVE",
      actualCompletionDate: null,
      allowableSubtractionReason: null,
    },
    reportingPeriod: PERIOD,
    outcomeRecord: null,
    licensureResult: null,
    ...overrides,
  };
}

function findMetric(
  results: ReturnType<typeof coe2026Classifier.classify>,
  metric: "COMPLETION" | "PLACEMENT" | "LICENSURE",
) {
  const result = results.find((r) => r.metric === metric);
  if (!result) throw new Error(`No ${metric} result produced`);
  return result;
}

describe("coe2026Classifier — Completion (docs/COE_RULE_MATRIX.md §3)", () => {
  it("classifies a graduate completer within the period", () => {
    const ctx = buildContext({
      enrollment: {
        enrollmentStatus: "GRADUATE_COMPLETER",
        actualCompletionDate: new Date("2026-01-15"),
        allowableSubtractionReason: null,
      },
    });
    const completion = findMetric(coe2026Classifier.classify(ctx), "COMPLETION");
    expect(completion.classificationCode).toBe("GRADUATE_COMPLETER");
    expect(completion.countsInNumerator).toBe(true);
    expect(completion.countsInDenominator).toBe(true);
  });

  it("classifies a non-graduate completer within the period", () => {
    const ctx = buildContext({
      enrollment: {
        enrollmentStatus: "NON_GRADUATE_COMPLETER",
        actualCompletionDate: new Date("2026-01-15"),
        allowableSubtractionReason: null,
      },
    });
    const completion = findMetric(coe2026Classifier.classify(ctx), "COMPLETION");
    expect(completion.classificationCode).toBe("NON_GRADUATE_COMPLETER");
    expect(completion.countsInNumerator).toBe(true);
    expect(completion.countsInDenominator).toBe(true);
  });

  it("classifies a withdrawal within the period as denominator-only", () => {
    const ctx = buildContext({
      enrollment: {
        enrollmentStatus: "WITHDRAWN",
        actualCompletionDate: new Date("2026-01-15"),
        allowableSubtractionReason: null,
      },
    });
    const completion = findMetric(coe2026Classifier.classify(ctx), "COMPLETION");
    expect(completion.classificationCode).toBe("WITHDRAWAL");
    expect(completion.countsInNumerator).toBe(false);
    expect(completion.countsInDenominator).toBe(true);
  });

  it("excludes a withdrawal for a documented allowable-subtraction reason entirely, rather than counting it against the institution", () => {
    const ctx = buildContext({
      enrollment: {
        enrollmentStatus: "WITHDRAWN",
        actualCompletionDate: new Date("2026-01-15"),
        allowableSubtractionReason: "DOCUMENTED_UNAVAILABLE",
      },
    });
    const completion = findMetric(coe2026Classifier.classify(ctx), "COMPLETION");
    expect(completion.classificationCode).toBe("ALLOWABLE_SUBTRACTION");
    expect(completion.countsInNumerator).toBe(false);
    expect(completion.countsInDenominator).toBe(false);
  });

  it("excludes a student still actively enrolled entirely", () => {
    const ctx = buildContext({
      enrollment: {
      enrollmentStatus: "ACTIVE",
      actualCompletionDate: null,
      allowableSubtractionReason: null,
    },
    });
    const completion = findMetric(coe2026Classifier.classify(ctx), "COMPLETION");
    expect(completion.classificationCode).toBe("NOT_APPLICABLE");
    expect(completion.countsInDenominator).toBe(false);
  });

  it("excludes a completion event that falls outside the reporting period", () => {
    const ctx = buildContext({
      enrollment: {
        enrollmentStatus: "GRADUATE_COMPLETER",
        actualCompletionDate: new Date("2024-01-15"),
        allowableSubtractionReason: null,
      },
    });
    const completion = findMetric(coe2026Classifier.classify(ctx), "COMPLETION");
    expect(completion.classificationCode).toBe("NOT_APPLICABLE");
  });
});

describe("coe2026Classifier — Placement (docs/COE_RULE_MATRIX.md §4)", () => {
  const graduateCtx = (
    outcomeRecord: ClassifierContext["outcomeRecord"],
    licensureResult: ClassifierContext["licensureResult"] = null,
  ) =>
    buildContext({
      enrollment: {
        enrollmentStatus: "GRADUATE_COMPLETER",
        actualCompletionDate: new Date("2026-01-15"),
        allowableSubtractionReason: null,
      },
      outcomeRecord,
      licensureResult,
    });

  it("is not applicable for a student who isn't a completer this period", () => {
    const ctx = buildContext({
      enrollment: {
      enrollmentStatus: "ACTIVE",
      actualCompletionDate: null,
      allowableSubtractionReason: null,
    },
    });
    expect(findMetric(coe2026Classifier.classify(ctx), "PLACEMENT").classificationCode).toBe(
      "NOT_APPLICABLE",
    );
  });

  it("treats a non-graduate completer as employed-related by definition, regardless of outcome data", () => {
    const ctx = buildContext({
      enrollment: {
        enrollmentStatus: "NON_GRADUATE_COMPLETER",
        actualCompletionDate: new Date("2026-01-15"),
        allowableSubtractionReason: null,
      },
      outcomeRecord: null,
    });
    const placement = findMetric(coe2026Classifier.classify(ctx), "PLACEMENT");
    expect(placement.classificationCode).toBe("EMPLOYED_RELATED");
    expect(placement.countsInNumerator).toBe(true);
  });

  it("counts employment related to the field of instruction", () => {
    const ctx = graduateCtx({
      employmentStatus: "EMPLOYED",
      relatedToTraining: true,
      continuingEducationStatus: "NOT_ENROLLED",
      militaryStatus: "NONE",
      availabilityForEmploymentStatus: "AVAILABLE",
      licensureRequired: false,
    });
    const placement = findMetric(coe2026Classifier.classify(ctx), "PLACEMENT");
    expect(placement.classificationCode).toBe("EMPLOYED_RELATED");
    expect(placement.countsInNumerator).toBe(true);
    expect(placement.countsInDenominator).toBe(true);
  });

  it("counts employment unrelated to the field as denominator-only", () => {
    const ctx = graduateCtx({
      employmentStatus: "EMPLOYED",
      relatedToTraining: false,
      continuingEducationStatus: "NOT_ENROLLED",
      militaryStatus: "NONE",
      availabilityForEmploymentStatus: "AVAILABLE",
      licensureRequired: false,
    });
    const placement = findMetric(coe2026Classifier.classify(ctx), "PLACEMENT");
    expect(placement.classificationCode).toBe("EMPLOYED_UNRELATED");
    expect(placement.countsInNumerator).toBe(false);
    expect(placement.countsInDenominator).toBe(true);
  });

  it("counts continuing education as related placement, not an exclusion (the rule an earlier draft got wrong)", () => {
    const ctx = graduateCtx({
      employmentStatus: "UNEMPLOYED",
      relatedToTraining: null,
      continuingEducationStatus: "ENROLLED",
      militaryStatus: "NONE",
      availabilityForEmploymentStatus: "AVAILABLE",
      licensureRequired: false,
    });
    const placement = findMetric(coe2026Classifier.classify(ctx), "PLACEMENT");
    expect(placement.classificationCode).toBe("EMPLOYED_RELATED");
    expect(placement.countsInNumerator).toBe(true);
  });

  it("counts entering the military as related placement", () => {
    const ctx = graduateCtx({
      employmentStatus: "UNEMPLOYED",
      relatedToTraining: null,
      continuingEducationStatus: "NOT_ENROLLED",
      militaryStatus: "ENTERED_MILITARY",
      availabilityForEmploymentStatus: "AVAILABLE",
      licensureRequired: false,
    });
    const placement = findMetric(coe2026Classifier.classify(ctx), "PLACEMENT");
    expect(placement.classificationCode).toBe("EMPLOYED_RELATED");
    expect(placement.countsInNumerator).toBe(true);
  });

  it.each([
    ["UNAVAILABLE_HEALTH_OR_FAMILY", "UNAVAILABLE"],
    ["UNAVAILABLE_INCARCERATED", "UNAVAILABLE"],
    ["UNAVAILABLE_DECEASED", "UNAVAILABLE"],
    ["REFUSED_EMPLOYMENT", "REFUSED"],
  ] as const)(
    "excludes documented %s from the placement denominator entirely",
    (availability, expectedCode) => {
      const ctx = graduateCtx({
        employmentStatus: "UNEMPLOYED",
        relatedToTraining: null,
        continuingEducationStatus: "NOT_ENROLLED",
        militaryStatus: "NONE",
        availabilityForEmploymentStatus: availability,
        licensureRequired: false,
      });
      const placement = findMetric(coe2026Classifier.classify(ctx), "PLACEMENT");
      expect(placement.classificationCode).toBe(expectedCode);
      expect(placement.countsInNumerator).toBe(false);
      expect(placement.countsInDenominator).toBe(false);
    },
  );

  it("excludes a graduate awaiting licensure results from the placement denominator", () => {
    const ctx = graduateCtx(
      {
        employmentStatus: "UNEMPLOYED",
        relatedToTraining: null,
        continuingEducationStatus: "NOT_ENROLLED",
        militaryStatus: "NONE",
        availabilityForEmploymentStatus: "AVAILABLE",
        licensureRequired: true,
      },
      { result: "WAITING" },
    );
    const placement = findMetric(coe2026Classifier.classify(ctx), "PLACEMENT");
    expect(placement.classificationCode).toBe("AWAITING_LICENSURE");
    expect(placement.countsInDenominator).toBe(false);
  });

  it("does NOT exclude as awaiting-licensure a graduate who is already employed related (order of precedence)", () => {
    const ctx = graduateCtx(
      {
        employmentStatus: "EMPLOYED",
        relatedToTraining: true,
        continuingEducationStatus: "NOT_ENROLLED",
        militaryStatus: "NONE",
        availabilityForEmploymentStatus: "AVAILABLE",
        licensureRequired: true,
      },
      null,
    );
    const placement = findMetric(coe2026Classifier.classify(ctx), "PLACEMENT");
    expect(placement.classificationCode).toBe("EMPLOYED_RELATED");
  });

  it("checks unavailable/refused before employment status (order of precedence)", () => {
    const ctx = graduateCtx({
      employmentStatus: "EMPLOYED",
      relatedToTraining: true,
      continuingEducationStatus: "NOT_ENROLLED",
      militaryStatus: "NONE",
      availabilityForEmploymentStatus: "UNAVAILABLE_HEALTH_OR_FAMILY",
      licensureRequired: false,
    });
    const placement = findMetric(coe2026Classifier.classify(ctx), "PLACEMENT");
    expect(placement.classificationCode).toBe("UNAVAILABLE");
  });

  it("falls back to seeking/unknown when no outcome record exists yet", () => {
    const ctx = graduateCtx(null);
    const placement = findMetric(coe2026Classifier.classify(ctx), "PLACEMENT");
    expect(placement.classificationCode).toBe("SEEKING_OR_UNKNOWN");
    expect(placement.countsInDenominator).toBe(true);
  });

  it("falls back to seeking/unknown when nothing else applies (counts against the institution)", () => {
    const ctx = graduateCtx({
      employmentStatus: "UNKNOWN",
      relatedToTraining: null,
      continuingEducationStatus: "NOT_ENROLLED",
      militaryStatus: "NONE",
      availabilityForEmploymentStatus: "AVAILABLE",
      licensureRequired: false,
    });
    const placement = findMetric(coe2026Classifier.classify(ctx), "PLACEMENT");
    expect(placement.classificationCode).toBe("SEEKING_OR_UNKNOWN");
    expect(placement.countsInNumerator).toBe(false);
    expect(placement.countsInDenominator).toBe(true);
  });
});

describe("coe2026Classifier — Licensure (docs/COE_RULE_MATRIX.md §5)", () => {
  const graduateCtx = (
    licensureRequired: boolean,
    licensureResult: ClassifierContext["licensureResult"],
  ) =>
    buildContext({
      enrollment: {
        enrollmentStatus: "GRADUATE_COMPLETER",
        actualCompletionDate: new Date("2026-01-15"),
        allowableSubtractionReason: null,
      },
      outcomeRecord: {
        employmentStatus: "EMPLOYED",
        relatedToTraining: true,
        continuingEducationStatus: "NOT_ENROLLED",
        militaryStatus: "NONE",
        availabilityForEmploymentStatus: "AVAILABLE",
        licensureRequired,
      },
      licensureResult,
    });

  it("is not applicable when the program doesn't require licensure", () => {
    const ctx = graduateCtx(false, null);
    expect(findMetric(coe2026Classifier.classify(ctx), "LICENSURE").classificationCode).toBe(
      "NOT_APPLICABLE",
    );
  });

  it("counts a passed exam in both numerator and denominator", () => {
    const ctx = graduateCtx(true, { result: "PASSED" });
    const licensure = findMetric(coe2026Classifier.classify(ctx), "LICENSURE");
    expect(licensure.classificationCode).toBe("PASSED");
    expect(licensure.countsInNumerator).toBe(true);
    expect(licensure.countsInDenominator).toBe(true);
  });

  it("counts a failed exam in the denominator only", () => {
    const ctx = graduateCtx(true, { result: "FAILED" });
    const licensure = findMetric(coe2026Classifier.classify(ctx), "LICENSURE");
    expect(licensure.classificationCode).toBe("FAILED");
    expect(licensure.countsInNumerator).toBe(false);
    expect(licensure.countsInDenominator).toBe(true);
  });

  it("excludes a student still awaiting exam/results entirely", () => {
    const ctx = graduateCtx(true, null);
    const licensure = findMetric(coe2026Classifier.classify(ctx), "LICENSURE");
    expect(licensure.classificationCode).toBe("AWAITING");
    expect(licensure.countsInDenominator).toBe(false);
  });

  it("is not applicable for a non-graduate completer even if the program requires licensure", () => {
    const ctx = buildContext({
      enrollment: {
        enrollmentStatus: "NON_GRADUATE_COMPLETER",
        actualCompletionDate: new Date("2026-01-15"),
        allowableSubtractionReason: null,
      },
      outcomeRecord: {
        employmentStatus: "EMPLOYED",
        relatedToTraining: true,
        continuingEducationStatus: "NOT_ENROLLED",
        militaryStatus: "NONE",
        availabilityForEmploymentStatus: "AVAILABLE",
        licensureRequired: true,
      },
      licensureResult: { result: "PASSED" },
    });
    expect(findMetric(coe2026Classifier.classify(ctx), "LICENSURE").classificationCode).toBe(
      "NOT_APPLICABLE",
    );
  });
});
