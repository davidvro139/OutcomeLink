import type {
  AvailabilityStatus,
  CompletionClassification,
  ContinuingEducationStatus,
  CplMetric,
  EmploymentStatus,
  EnrollmentStatus,
  LicensureClassification,
  MilitaryStatus,
  PlacementClassification,
} from "@outcomelink/shared";

export interface ClassificationResult {
  metric: CplMetric;
  classificationCode: CompletionClassification | PlacementClassification | LicensureClassification;
  countsInNumerator: boolean;
  countsInDenominator: boolean;
  reasonText: string;
}

/**
 * Everything a classifier needs to decide one student's status for one
 * reporting period. Deliberately plain data (no Prisma types) so classifiers
 * stay pure and unit-testable without a database — the calculator
 * (server/src/modules/accreditation/calculators) is responsible for
 * assembling this from real records.
 */
export interface ClassifierContext {
  enrollment: {
    enrollmentStatus: EnrollmentStatus;
    actualCompletionDate: Date | null;
  };
  reportingPeriod: {
    startDate: Date;
    endDate: Date;
  };
  outcomeRecord: {
    employmentStatus: EmploymentStatus | null;
    relatedToTraining: boolean | null;
    continuingEducationStatus: ContinuingEducationStatus | null;
    militaryStatus: MilitaryStatus | null;
    availabilityForEmploymentStatus: AvailabilityStatus | null;
    licensureRequired: boolean;
  } | null;
  /** The licensure attempt most relevant to this reporting period, if any. */
  licensureResult: {
    result: "PASSED" | "FAILED" | "UNKNOWN" | "WAITING" | "SCHEDULED";
  } | null;
}

export interface Classifier {
  readonly frameworkName: string;
  readonly versionLabel: string;
  classify(context: ClassifierContext): ClassificationResult[];
}
