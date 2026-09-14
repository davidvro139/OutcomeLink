import type { ClassificationResult, Classifier, ClassifierContext } from "./types";

function isWithinPeriod(date: Date | null, period: { startDate: Date; endDate: Date }): boolean {
  if (!date) return false;
  return date >= period.startDate && date <= period.endDate;
}

/**
 * COE Completion classification — docs/COE_RULE_MATRIX.md §3.
 * A student only gets a real classification the reporting period their
 * enrollment actually concludes (graduation or withdrawal) in; otherwise
 * they're still enrolled and not part of this period's calculation at all.
 */
function classifyCompletion(ctx: ClassifierContext): ClassificationResult {
  const { enrollment, reportingPeriod } = ctx;
  const concludedThisPeriod = isWithinPeriod(enrollment.actualCompletionDate, reportingPeriod);

  if (enrollment.enrollmentStatus === "GRADUATE_COMPLETER" && concludedThisPeriod) {
    return {
      metric: "COMPLETION",
      classificationCode: "GRADUATE_COMPLETER",
      countsInNumerator: true,
      countsInDenominator: true,
      reasonText: "Earned a credential within this reporting period (COE: Graduate Completer).",
    };
  }

  if (enrollment.enrollmentStatus === "NON_GRADUATE_COMPLETER" && concludedThisPeriod) {
    return {
      metric: "COMPLETION",
      classificationCode: "NON_GRADUATE_COMPLETER",
      countsInNumerator: true,
      countsInDenominator: true,
      reasonText:
        "Left the program without a credential but acquired sufficient competencies for related employment within this reporting period (COE: Non-Graduate Completer).",
    };
  }

  if (enrollment.enrollmentStatus === "WITHDRAWN" && concludedThisPeriod) {
    return {
      metric: "COMPLETION",
      classificationCode: "WITHDRAWAL",
      countsInNumerator: false,
      countsInDenominator: true,
      reasonText:
        "Withdrew without earning a credential or securing related employment within this reporting period (COE: Withdrawal — counts against the completion rate).",
    };
  }

  return {
    metric: "COMPLETION",
    classificationCode: "NOT_APPLICABLE",
    countsInNumerator: false,
    countsInDenominator: false,
    reasonText: "No completion event (graduation or withdrawal) fell within this reporting period.",
  };
}

/**
 * COE Placement classification — docs/COE_RULE_MATRIX.md §4. Only completers
 * are eligible; a non-graduate completer is employed-related by definition.
 * For graduates, order matters: unavailable/refused exclude first, then
 * continuing-education/military/employment determine related-vs-unrelated,
 * then awaiting-licensure excludes, and anything left over is seeking/unknown.
 */
function classifyPlacement(
  ctx: ClassifierContext,
  completion: ClassificationResult,
): ClassificationResult {
  const notApplicable: ClassificationResult = {
    metric: "PLACEMENT",
    classificationCode: "NOT_APPLICABLE",
    countsInNumerator: false,
    countsInDenominator: false,
    reasonText:
      "Not a completer this reporting period, so not eligible for placement classification.",
  };

  if (completion.classificationCode === "NON_GRADUATE_COMPLETER") {
    return {
      metric: "PLACEMENT",
      classificationCode: "EMPLOYED_RELATED",
      countsInNumerator: true,
      countsInDenominator: true,
      reasonText:
        "Non-graduate completers are employed-related by definition (COE Annual Report Help Manual).",
    };
  }

  if (completion.classificationCode !== "GRADUATE_COMPLETER") return notApplicable;

  const outcome = ctx.outcomeRecord;
  if (!outcome) {
    return {
      metric: "PLACEMENT",
      classificationCode: "SEEKING_OR_UNKNOWN",
      countsInNumerator: false,
      countsInDenominator: true,
      reasonText: "No outcome record on file yet; treated as seeking employment / status unknown.",
    };
  }

  const availability = outcome.availabilityForEmploymentStatus;
  if (
    availability === "UNAVAILABLE_HEALTH_OR_FAMILY" ||
    availability === "UNAVAILABLE_INCARCERATED" ||
    availability === "UNAVAILABLE_DECEASED"
  ) {
    return {
      metric: "PLACEMENT",
      classificationCode: "UNAVAILABLE",
      countsInNumerator: false,
      countsInDenominator: false,
      reasonText: `Documented unavailability for employment (${availability}); excluded from the placement denominator per COE rules.`,
    };
  }

  if (availability === "REFUSED_EMPLOYMENT") {
    return {
      metric: "PLACEMENT",
      classificationCode: "REFUSED",
      countsInNumerator: false,
      countsInDenominator: false,
      reasonText:
        "Documented refusal of interviews/employment; excluded from the placement denominator per COE rules.",
    };
  }

  if (outcome.continuingEducationStatus === "ENROLLED") {
    return {
      metric: "PLACEMENT",
      classificationCode: "EMPLOYED_RELATED",
      countsInNumerator: true,
      countsInDenominator: true,
      reasonText: "Continuing education counts as related placement per COE rules.",
    };
  }

  if (outcome.militaryStatus === "ENTERED_MILITARY") {
    return {
      metric: "PLACEMENT",
      classificationCode: "EMPLOYED_RELATED",
      countsInNumerator: true,
      countsInDenominator: true,
      reasonText: "Entered the military, which counts as related placement per COE rules.",
    };
  }

  if (outcome.employmentStatus === "EMPLOYED" && outcome.relatedToTraining === true) {
    return {
      metric: "PLACEMENT",
      classificationCode: "EMPLOYED_RELATED",
      countsInNumerator: true,
      countsInDenominator: true,
      reasonText: "Employed in a position related to the field of instruction.",
    };
  }

  if (outcome.employmentStatus === "EMPLOYED" && outcome.relatedToTraining === false) {
    return {
      metric: "PLACEMENT",
      classificationCode: "EMPLOYED_UNRELATED",
      countsInNumerator: false,
      countsInDenominator: true,
      reasonText: "Employed, but in a position unrelated to the field of instruction.",
    };
  }

  if (
    outcome.licensureRequired &&
    (!ctx.licensureResult ||
      ctx.licensureResult.result === "WAITING" ||
      ctx.licensureResult.result === "SCHEDULED")
  ) {
    return {
      metric: "PLACEMENT",
      classificationCode: "AWAITING_LICENSURE",
      countsInNumerator: false,
      countsInDenominator: false,
      reasonText:
        "Awaiting licensure exam or results; excluded from the placement denominator per COE rules until resolved.",
    };
  }

  return {
    metric: "PLACEMENT",
    classificationCode: "SEEKING_OR_UNKNOWN",
    countsInNumerator: false,
    countsInDenominator: true,
    reasonText:
      "Currently seeking related employment, or could not be traced for follow-up; counts against the placement rate per COE rules.",
  };
}

/** COE Licensure classification — docs/COE_RULE_MATRIX.md §5. Only applies to graduate completers of licensure-required programs. */
function classifyLicensure(
  ctx: ClassifierContext,
  completion: ClassificationResult,
): ClassificationResult {
  const notApplicable: ClassificationResult = {
    metric: "LICENSURE",
    classificationCode: "NOT_APPLICABLE",
    countsInNumerator: false,
    countsInDenominator: false,
    reasonText:
      "Licensure is not required for this program, or the student is not a graduate completer this period.",
  };

  if (completion.classificationCode !== "GRADUATE_COMPLETER") return notApplicable;
  if (!ctx.outcomeRecord?.licensureRequired) return notApplicable;

  const result = ctx.licensureResult?.result;
  if (result === "PASSED") {
    return {
      metric: "LICENSURE",
      classificationCode: "PASSED",
      countsInNumerator: true,
      countsInDenominator: true,
      reasonText: "Passed the required licensure exam.",
    };
  }
  if (result === "FAILED") {
    return {
      metric: "LICENSURE",
      classificationCode: "FAILED",
      countsInNumerator: false,
      countsInDenominator: true,
      reasonText: "Took the required licensure exam and did not pass.",
    };
  }
  return {
    metric: "LICENSURE",
    classificationCode: "AWAITING",
    countsInNumerator: false,
    countsInDenominator: false,
    reasonText:
      "Awaiting licensure exam or results; excluded from the licensure pass rate until resolved.",
  };
}

export const coe2026Classifier: Classifier = {
  frameworkName: "COE",
  versionLabel: "COE-2026",
  classify(context: ClassifierContext): ClassificationResult[] {
    const completion = classifyCompletion(context);
    const placement = classifyPlacement(context, completion);
    const licensure = classifyLicensure(context, completion);
    return [completion, placement, licensure];
  },
};
