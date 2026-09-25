import type { EnrollmentStatus, LicensureResultStatus, ReportingPeriodStatus, Role } from "@prisma/client";
import { faker } from "@faker-js/faker";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { storage } from "../src/lib/storage";
import { computeReportingPeriod } from "../src/modules/accreditation/calculators/cplCalculator";
import { runValidation } from "../src/modules/accreditation/validators/validationEngine";

/**
 * Synthetic demo data for Mountain West Technical College (spec §61,
 * docs/TODO.md stage 8). Deterministic (faker.seed below) so re-running
 * `npm run prisma:seed` against a fresh database reproduces the same
 * dataset — useful for screenshots and for the Cypress smoke spec, which
 * relies on at least one reporting period existing.
 *
 * Deliberately wipes every table first: this is meant to be run against a
 * local dev database, the same way jest.globalSetup.cjs resets the
 * dedicated test database before integration tests.
 */
faker.seed(20260914);

const REGIONS: { city: string; state: string }[] = [
  { city: "Denver", state: "CO" },
  { city: "Boulder", state: "CO" },
  { city: "Colorado Springs", state: "CO" },
  { city: "Fort Collins", state: "CO" },
  { city: "Pueblo", state: "CO" },
  { city: "Salt Lake City", state: "UT" },
  { city: "Provo", state: "UT" },
  { city: "Ogden", state: "UT" },
  { city: "Boise", state: "ID" },
  { city: "Idaho Falls", state: "ID" },
  { city: "Billings", state: "MT" },
  { city: "Missoula", state: "MT" },
  { city: "Cheyenne", state: "WY" },
  { city: "Casper", state: "WY" },
  { city: "Albuquerque", state: "NM" },
];

const INDUSTRIES = [
  "Healthcare",
  "Construction",
  "Automotive Repair",
  "Manufacturing",
  "Information Technology",
  "Retail",
  "Hospitality",
  "Personal Care Services",
  "Transportation & Logistics",
  "Professional Services",
];

interface ProgramConfig {
  code: string;
  name: string;
  department: string;
  campus: "Main" | "North";
  credentialType: string;
  programLength: string;
  clockHours?: number;
  creditHours?: number;
  licensureRequired: boolean;
  licensureExamName?: string;
  startYear: number;
  targets: { completion: number; placement: number; licensure?: number };
  cohortSizeRange: [number, number];
}

const DEFAULT_COHORT_RANGE: [number, number] = [14, 32];

const PROGRAMS: ProgramConfig[] = [
  {
    code: "PN",
    name: "Practical Nursing",
    department: "Health Sciences",
    campus: "Main",
    credentialType: "Diploma",
    programLength: "12 months",
    clockHours: 1400,
    licensureRequired: true,
    licensureExamName: "NCLEX-PN",
    startYear: 2023,
    targets: { completion: 0.78, placement: 0.88, licensure: 0.85 },
    cohortSizeRange: DEFAULT_COHORT_RANGE,
  },
  {
    code: "MA",
    name: "Medical Assisting",
    department: "Health Sciences",
    campus: "Main",
    credentialType: "Certificate",
    programLength: "9 months",
    clockHours: 900,
    licensureRequired: false,
    startYear: 2023,
    targets: { completion: 0.72, placement: 0.8 },
    cohortSizeRange: DEFAULT_COHORT_RANGE,
  },
  {
    code: "DA",
    name: "Dental Assisting",
    department: "Health Sciences",
    campus: "North",
    credentialType: "Certificate",
    programLength: "9 months",
    clockHours: 850,
    licensureRequired: true,
    licensureExamName: "Radiography Certification Exam",
    startYear: 2023,
    targets: { completion: 0.7, placement: 0.82, licensure: 0.9 },
    cohortSizeRange: DEFAULT_COHORT_RANGE,
  },
  {
    code: "ST",
    name: "Surgical Technology",
    department: "Health Sciences",
    campus: "Main",
    credentialType: "Diploma",
    programLength: "18 months",
    clockHours: 1600,
    licensureRequired: true,
    licensureExamName: "Certified Surgical Technologist Exam",
    // Deliberately a new program with no history before 2024 — exercises the
    // "program didn't exist yet this period" case (zero-denominator, not a failure).
    startYear: 2024,
    targets: { completion: 0.55, placement: 0.75, licensure: 0.6 },
    cohortSizeRange: [6, 10],
  },
  {
    code: "ET",
    name: "Electrical Technology",
    department: "Skilled Trades",
    campus: "Main",
    credentialType: "Diploma",
    programLength: "12 months",
    clockHours: 1200,
    licensureRequired: false,
    startYear: 2023,
    targets: { completion: 0.8, placement: 0.85 },
    cohortSizeRange: DEFAULT_COHORT_RANGE,
  },
  {
    code: "HVAC",
    name: "HVAC Technology",
    department: "Skilled Trades",
    campus: "North",
    credentialType: "Diploma",
    programLength: "12 months",
    clockHours: 1200,
    licensureRequired: false,
    startYear: 2023,
    targets: { completion: 0.75, placement: 0.78 },
    cohortSizeRange: DEFAULT_COHORT_RANGE,
  },
  {
    code: "WELD",
    name: "Welding Technology",
    department: "Skilled Trades",
    campus: "Main",
    credentialType: "Certificate",
    programLength: "9 months",
    clockHours: 900,
    licensureRequired: false,
    startYear: 2023,
    targets: { completion: 0.82, placement: 0.9 },
    cohortSizeRange: DEFAULT_COHORT_RANGE,
  },
  {
    code: "AUTO",
    name: "Automotive Technology",
    department: "Skilled Trades",
    campus: "North",
    credentialType: "Diploma",
    programLength: "12 months",
    clockHours: 1200,
    licensureRequired: true,
    licensureExamName: "ASE Certification",
    startYear: 2023,
    targets: { completion: 0.68, placement: 0.72, licensure: 0.65 },
    cohortSizeRange: DEFAULT_COHORT_RANGE,
  },
  {
    code: "PLUMB",
    name: "Plumbing Technology",
    department: "Skilled Trades",
    campus: "North",
    credentialType: "Certificate",
    programLength: "9 months",
    clockHours: 900,
    licensureRequired: false,
    startYear: 2023,
    // Below the 70% placement benchmark on purpose — a "struggling program" example.
    targets: { completion: 0.6, placement: 0.65 },
    cohortSizeRange: DEFAULT_COHORT_RANGE,
  },
  {
    code: "BUSAD",
    name: "Business Administration",
    department: "Business & IT",
    campus: "Main",
    credentialType: "Associate Degree",
    programLength: "24 months",
    creditHours: 64,
    licensureRequired: false,
    startYear: 2023,
    targets: { completion: 0.65, placement: 0.8 },
    cohortSizeRange: DEFAULT_COHORT_RANGE,
  },
  {
    code: "ITNET",
    name: "IT Networking & Cybersecurity",
    department: "Business & IT",
    campus: "Main",
    credentialType: "Associate Degree",
    programLength: "24 months",
    creditHours: 68,
    licensureRequired: false,
    startYear: 2023,
    targets: { completion: 0.7, placement: 0.85 },
    cohortSizeRange: DEFAULT_COHORT_RANGE,
  },
  {
    code: "ACCT",
    name: "Accounting Technology",
    department: "Business & IT",
    campus: "Main",
    credentialType: "Certificate",
    programLength: "12 months",
    creditHours: 42,
    licensureRequired: false,
    startYear: 2023,
    targets: { completion: 0.75, placement: 0.78 },
    cohortSizeRange: DEFAULT_COHORT_RANGE,
  },
  {
    code: "COSM",
    name: "Cosmetology",
    department: "Cosmetology & Personal Services",
    campus: "North",
    credentialType: "Diploma",
    programLength: "12 months",
    clockHours: 1500,
    licensureRequired: true,
    licensureExamName: "State Cosmetology Licensing Exam",
    startYear: 2023,
    targets: { completion: 0.73, placement: 0.8, licensure: 0.88 },
    cohortSizeRange: DEFAULT_COHORT_RANGE,
  },
  {
    code: "BARB",
    name: "Barbering",
    department: "Cosmetology & Personal Services",
    campus: "North",
    credentialType: "Certificate",
    programLength: "9 months",
    clockHours: 1000,
    licensureRequired: true,
    licensureExamName: "State Barbering Licensing Exam",
    startYear: 2023,
    // Below the 60% completion benchmark on purpose, and a small cohort.
    targets: { completion: 0.58, placement: 0.7, licensure: 0.75 },
    cohortSizeRange: [5, 9],
  },
];

interface PeriodConfig {
  label: string;
  year: number;
  status: ReportingPeriodStatus;
}

const PERIODS: PeriodConfig[] = [
  { label: "2023", year: 2023, status: "SUBMITTED" },
  { label: "2024", year: 2024, status: "SUBMITTED" },
  { label: "2025", year: 2025, status: "FINALIZED" },
  { label: "2026", year: 2026, status: "OPEN" },
];

function randomInt(min: number, max: number): number {
  return faker.number.int({ min, max });
}

function chance(probability: number): boolean {
  return faker.number.float({ min: 0, max: 1 }) < probability;
}

function weightedPick<T extends string>(weights: [T, number][]): T {
  const total = weights.reduce((sum, [, w]) => sum + Math.max(w, 0), 0);
  let r = faker.number.float({ min: 0, max: total });
  for (const [value, weight] of weights) {
    r -= Math.max(weight, 0);
    if (r <= 0) return value;
  }
  return weights[weights.length - 1][0];
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function randomDateBetween(start: Date, end: Date): Date {
  return faker.date.between({ from: start, to: end });
}

async function main() {
  console.log("Wiping existing data...");
  await wipeDatabase();

  console.log("Creating institution, campuses, departments...");
  const institution = await prisma.institution.create({
    data: { name: "Mountain West Technical College" },
  });
  const mainCampus = await prisma.campus.create({
    data: {
      institutionId: institution.id,
      name: "Main Campus",
      address: "4200 Industry Pkwy",
      city: "Denver",
      state: "CO",
      zip: "80216",
    },
  });
  const northCampus = await prisma.campus.create({
    data: {
      institutionId: institution.id,
      name: "North Campus",
      address: "1150 Technical Dr",
      city: "Fort Collins",
      state: "CO",
      zip: "80524",
    },
  });
  const campusByName = { Main: mainCampus, North: northCampus };

  const departmentNames = [...new Set(PROGRAMS.map((p) => p.department))];
  const departmentByName = new Map<string, { id: number }>();
  for (const name of departmentNames) {
    const department = await prisma.department.create({
      data: { institutionId: institution.id, name },
    });
    departmentByName.set(name, department);
  }

  console.log("Creating accreditation framework, rule set, reporting periods...");
  const framework = await prisma.accreditationFramework.create({
    data: {
      name: "COE",
      description: "Council on Occupational Education annual reporting requirements.",
    },
  });
  const ruleSet = await prisma.ruleSet.create({
    data: {
      frameworkId: framework.id,
      versionLabel: "COE-2026",
      effectiveStartDate: new Date("2023-01-01"),
      ruleDefinitionSchemaVersion: "1",
      ruleDefinition: { benchmarks: { completion: 60, placement: 70, licensure: 70 } },
    },
  });

  const periodByYear = new Map<number, { id: number; startDate: Date; endDate: Date }>();
  for (const period of PERIODS) {
    const reportingPeriod = await prisma.reportingPeriod.create({
      data: {
        institutionId: institution.id,
        ruleSetId: ruleSet.id,
        label: period.label,
        startDate: new Date(`${period.year}-01-01T00:00:00.000Z`),
        endDate: new Date(`${period.year}-12-31T23:59:59.999Z`),
        status: "OPEN", // set to the real target status only after data + compute + validate below
      },
    });
    periodByYear.set(period.year, reportingPeriod);
  }

  console.log("Creating programs and cohorts...");
  const programRows = new Map<string, { id: number; config: ProgramConfig }>();
  for (const config of PROGRAMS) {
    const program = await prisma.program.create({
      data: {
        institutionId: institution.id,
        campusId: campusByName[config.campus].id,
        departmentId: departmentByName.get(config.department)!.id,
        name: config.name,
        code: config.code,
        credentialType: config.credentialType,
        programLength: config.programLength,
        clockHours: config.clockHours,
        creditHours: config.creditHours,
        licensureRequired: config.licensureRequired,
        accreditationReportingStatus: "Active",
        effectiveStartDate: new Date(`${config.startYear}-01-01T00:00:00.000Z`),
      },
    });
    programRows.set(config.code, { id: program.id, config });
  }

  console.log("Creating staff users...");
  const passwordHash = await hashPassword("password123");
  const usersByRole: Record<string, { id: number; name: string }[]> = {};
  async function createUser(name: string, email: string, role: Role) {
    const user = await prisma.user.create({
      data: { institutionId: institution.id, name, email, passwordHash, role },
    });
    usersByRole[role] = [...(usersByRole[role] ?? []), { id: user.id, name: user.name }];
    return user;
  }

  // Required by the frontend's dev-only "Demo login" button (client/src/pages/LoginPage.tsx).
  await createUser("Ada Administrator", "ada@mwtc.edu", "INSTITUTIONAL_ADMINISTRATOR");
  await createUser("Sam Sysadmin", "sam@mwtc.edu", "SYSTEM_ADMINISTRATOR");
  const programAdminNames = ["Priya Patel", "Marcus Webb", "Dana Kowalski", "Elena Ruiz"];
  for (const name of programAdminNames) {
    await createUser(
      name,
      `${name.toLowerCase().replace(" ", ".")}@mwtc.edu`,
      "PROGRAM_ADMINISTRATOR",
    );
  }
  const careerServicesNames = ["Jordan Blake", "Casey Nguyen", "Morgan Ellis"];
  for (const name of careerServicesNames) {
    await createUser(
      name,
      `${name.toLowerCase().replace(" ", ".")}@mwtc.edu`,
      "CAREER_SERVICES_STAFF",
    );
  }
  const instructorNames = ["Terry Osei", "Renee Fischer"];
  for (const name of instructorNames) {
    await createUser(name, `${name.toLowerCase().replace(" ", ".")}@mwtc.edu`, "INSTRUCTOR_STAFF");
  }
  await createUser("Quinn Alvarado", "quinn.alvarado@mwtc.edu", "READ_ONLY_AUDITOR");

  // Program admins get access to a rotating slice of programs; career services
  // and instructor staff get campus-wide access — both exercised by
  // requireProgramAccess/requireCampusAccess (server/src/middleware/auth.ts).
  // Program Administrator and Read-Only/Auditor are the two roles the API
  // actually restricts to this assignment (accessScope.ts's
  // PROGRAM_SCOPED_ROLES); career services/instructor access is granted the
  // same way but isn't currently enforced (spec §4: explicitly institution-
  // wide for Career Services, left institution-wide by product decision for
  // Instructor/Staff).
  const allProgramIds = [...programRows.values()].map((p) => p.id);
  const admins = usersByRole["PROGRAM_ADMINISTRATOR"] ?? [];
  for (let i = 0; i < admins.length; i++) {
    const admin = admins[i];
    const slice = allProgramIds.filter((_, idx) => idx % admins.length === i);
    for (const programId of slice) {
      await prisma.userProgramAccess.create({ data: { userId: admin.id, programId } });
    }
  }
  for (const staff of [...(usersByRole["CAREER_SERVICES_STAFF"] ?? []), ...(usersByRole["INSTRUCTOR_STAFF"] ?? [])]) {
    await prisma.userCampusAccess.create({ data: { userId: staff.id, campusId: mainCampus.id } });
    await prisma.userCampusAccess.create({ data: { userId: staff.id, campusId: northCampus.id } });
  }
  // The one seeded auditor is scoped to Main Campus only (via UserCampusAccess,
  // not UserProgramAccess — proving either grant mechanism works for either
  // scoped role), so this account has something real to demo/verify against
  // instead of the fail-closed "sees nothing" default an unassigned scoped
  // user would otherwise get.
  for (const auditor of usersByRole["READ_ONLY_AUDITOR"] ?? []) {
    await prisma.userCampusAccess.create({ data: { userId: auditor.id, campusId: mainCampus.id } });
  }

  console.log("Creating employers...");
  const employers: { id: number }[] = [];
  for (let i = 0; i < 130; i++) {
    const region = faker.helpers.arrayElement(REGIONS);
    // A small minority have no findable address or phone on file at all —
    // deliberate edge case for the EMPLOYER_MISSING_VERIFIABLE_CONTACT
    // validation check (docs/TODO.md §9).
    const unverifiable = chance(0.05);
    const employer = await prisma.employer.create({
      data: {
        institutionId: institution.id,
        name: faker.company.name(),
        industry: faker.helpers.arrayElement(INDUSTRIES),
        address: unverifiable ? undefined : faker.location.streetAddress(),
        city: unverifiable ? undefined : region.city,
        state: unverifiable ? undefined : region.state,
        zip: unverifiable ? undefined : faker.location.zipCode(),
        website: faker.internet.url(),
      },
    });
    employers.push(employer);

    const contactCount = randomInt(1, 3);
    for (let c = 0; c < contactCount; c++) {
      await prisma.employerContact.create({
        data: {
          employerId: employer.id,
          name: faker.person.fullName(),
          title: faker.person.jobTitle(),
          phone: unverifiable ? undefined : faker.phone.number(),
          email: faker.internet.email(),
          isPrimaryContact: c === 0,
          isVerificationContact: c === 0 || chance(0.3),
        },
      });
    }
  }

  console.log("Creating students, enrollments, and outcomes (this is the slow part)...");
  const careerServicesStaff = usersByRole["CAREER_SERVICES_STAFF"] ?? [];
  const allNamedStudents: { firstName: string; lastName: string; enrollmentId: number }[] = [];
  let internalIdCounter = 100000;

  for (const [, { id: programId, config }] of programRows) {
    for (const period of PERIODS) {
      if (period.year < config.startYear) continue; // program didn't exist yet
      const reportingPeriod = periodByYear.get(period.year)!;
      const isCurrentPeriod = period.status === "OPEN";

      const cohort = await prisma.cohort.create({
        data: {
          programId,
          name: `${config.code}-${period.year}`,
          entryTerm: "Fall",
          entryYear: period.year - 1,
        },
      });

      const cohortSize = randomInt(...config.cohortSizeRange);
      for (let i = 0; i < cohortSize; i++) {
        internalIdCounter++;
        const firstName = faker.person.firstName();
        const lastName = faker.person.lastName();
        const student = await prisma.student.create({
          data: {
            institutionId: institution.id,
            internalStudentId: `MWTC-${internalIdCounter}`,
            firstName,
            lastName,
            email: chance(0.85) ? faker.internet.email({ firstName, lastName }) : undefined,
            phone: chance(0.8) ? faker.phone.number() : undefined,
          },
        });

        if (chance(0.9)) {
          await prisma.studentCommunicationPreference.create({
            data: {
              studentId: student.id,
              preferredContactMethod: faker.helpers.arrayElement(["PHONE", "EMAIL", "SMS"]),
              smsConsentStatus: chance(0.6),
              doNotContact: chance(0.03),
              doNotContactReason: chance(0.03) ? "Requested no further contact." : undefined,
            },
          });
        }

        // ~85% have demographics on file, ~15% have no demographic data
        if (chance(0.85)) {
          const genders = ["MALE", "FEMALE", "NONBINARY", "PREFER_NOT_TO_SAY"];
          const races = [
            "AMERICAN_INDIAN_ALASKA_NATIVE",
            "ASIAN",
            "BLACK_AFRICAN_AMERICAN",
            "HISPANIC_LATINO",
            "NATIVE_HAWAIIAN_PACIFIC_ISLANDER",
            "WHITE",
            "TWO_OR_MORE_RACES",
            "NONRESIDENT_ALIEN",
            "UNKNOWN_OR_NOT_REPORTED",
          ];
          await prisma.studentDemographics.create({
            data: {
              studentId: student.id,
              gender: chance(0.9) ? faker.helpers.arrayElement(genders) : null,
              raceEthnicity: chance(0.9) ? faker.helpers.arrayElement(races) : null,
              economicallyDisadvantaged: chance(0.9) ? chance(0.4) : null,
              firstGenerationStudent: chance(0.9) ? chance(0.35) : null,
              disabilityStatus: chance(0.9) ? chance(0.15) : null,
            },
          });
        }

        // Decide enrollment status. Closed periods: everyone has concluded.
        // The current open period also carries a share of still-enrolled students.
        let enrollmentStatus: EnrollmentStatus;
        if (isCurrentPeriod && chance(0.4)) {
          enrollmentStatus = "ACTIVE";
        } else {
          const completionRate = config.targets.completion;
          enrollmentStatus = weightedPick<EnrollmentStatus>([
            ["GRADUATE_COMPLETER", completionRate * 0.9],
            ["NON_GRADUATE_COMPLETER", completionRate * 0.1],
            ["WITHDRAWN", 1 - completionRate],
          ]);
        }

        const periodStart = reportingPeriod.startDate;
        const periodEnd = reportingPeriod.endDate;
        const concluded = enrollmentStatus !== "ACTIVE";
        const completionDate = concluded ? randomDateBetween(periodStart, periodEnd) : null;
        const startDate = concluded
          ? addMonths(completionDate!, -randomInt(9, 20))
          : addMonths(new Date(), -randomInt(3, 15));
        const expectedCompletionDate = concluded
          ? completionDate
          : addMonths(new Date(), randomInt(2, 10));

        // A minority of withdrawals fall into a documented "Allowable Subtraction"
        // category (docs/COE_RULE_MATRIX.md §2 / docs/TODO.md §9) — excluded from
        // the completion rate entirely rather than counted against the program.
        let exitReason: string | undefined;
        let allowableSubtractionReason:
          | "DOCUMENTED_UNAVAILABLE"
          | "MISSION_FOREIGN_AID_OR_MILITARY_ACTIVATION"
          | "FULL_REFUND_OR_FIRST_DAY_ONLY"
          | undefined;
        if (enrollmentStatus === "WITHDRAWN") {
          const r = faker.number.float({ min: 0, max: 1 });
          if (r < 0.08) {
            exitReason = "Documented serious health issue";
            allowableSubtractionReason = "DOCUMENTED_UNAVAILABLE";
          } else if (r < 0.14) {
            exitReason = "Military/National Guard activation";
            allowableSubtractionReason = "MISSION_FOREIGN_AID_OR_MILITARY_ACTIVATION";
          } else if (r < 0.18) {
            exitReason = "Withdrew during the first week (full tuition refund)";
            allowableSubtractionReason = "FULL_REFUND_OR_FIRST_DAY_ONLY";
          } else {
            exitReason = faker.helpers.arrayElement([
              "Personal/family reasons",
              "Financial hardship",
              "Relocated",
              "Academic difficulty",
              "Employment conflict",
            ]);
          }
        }

        // Enrollment objective (docs/TODO.md §9) — mostly ordinary postsecondary
        // enrollees, with a small minority of dual-enrolled secondary students and
        // personal-enrichment enrollees who are entirely out of scope for CPL
        // reporting. These labels are this fictional college's own SIS
        // vocabulary, not COE-mandated terminology — see the schema's doc comment.
        const objectiveRoll = faker.number.float({ min: 0, max: 1 });
        const enrollmentObjective =
          objectiveRoll < 0.03
            ? "Secondary"
            : objectiveRoll < 0.05
              ? "Personal Enrichment"
              : chance(0.15)
                ? "Occupational Upgrade"
                : "Certificate Seeker";
        const reportableForAccreditation =
          enrollmentObjective !== "Secondary" && enrollmentObjective !== "Personal Enrichment";

        const enrollment = await prisma.studentEnrollment.create({
          data: {
            studentId: student.id,
            programId,
            campusId: campusByName[config.campus].id,
            enrollmentObjective,
            reportableForAccreditation,
            cohortId: cohort.id,
            startDate,
            expectedCompletionDate,
            actualCompletionDate: completionDate,
            enrollmentStatus,
            credentialEarned: enrollmentStatus === "GRADUATE_COMPLETER" ? config.credentialType : undefined,
            exitReason,
            allowableSubtractionReason,
          },
        });

        allNamedStudents.push({ firstName, lastName, enrollmentId: enrollment.id });

        if (!concluded) continue; // still-enrolled students have no outcome record yet

        // Deliberate "missing completion date" data-quality issue, historical periods only.
        if (!isCurrentPeriod && chance(0.006)) {
          await prisma.studentEnrollment.update({
            where: { id: enrollment.id },
            data: { actualCompletionDate: null },
          });
          continue; // matches validationEngine's own "can't tell if in period" short-circuit
        }

        // Deliberate "missing outcome record" data-quality issue.
        if (chance(0.04)) continue;

        const bucket = weightedPick<
          | "employedRelated"
          | "continuingEd"
          | "military"
          | "awaitingLicensure"
          | "unavailable"
          | "refused"
          | "employedUnrelated"
          | "seekingUnknown"
        >([
          ["employedRelated", config.targets.placement],
          ["continuingEd", 0.03],
          ["military", 0.015],
          ["awaitingLicensure", config.licensureRequired ? 0.05 : 0],
          ["unavailable", 0.02],
          ["refused", 0.01],
          ["employedUnrelated", 0.06],
          ["seekingUnknown", Math.max(0.05, 1 - config.targets.placement)],
        ]);

        const employer = faker.helpers.arrayElement(employers);
        const employmentStartDate = addMonths(completionDate!, randomInt(0, 3));
        const verified = chance(0.8);
        const withEvidence = verified && chance(0.55);
        const jobTitle = faker.person.jobTitle();

        const base = {
          reportingPeriodId: reportingPeriod.id,
          licensureRequired: config.licensureRequired,
          completionClassification:
            enrollmentStatus === "GRADUATE_COMPLETER" ? "Graduate Completer" : "Non-Graduate Completer",
        };

        let outcomeData: Record<string, unknown> = { ...base };
        switch (bucket) {
          case "employedRelated":
            outcomeData = {
              ...base,
              employmentStatus: "EMPLOYED",
              employerId: employer.id,
              jobTitle,
              employmentStartDate,
              relatedToTraining: true,
              relatedToTrainingJustification: chance(0.85)
                ? `Job duties directly use skills taught in the ${config.name} program.`
                : undefined,
              relatedToTrainingSource: faker.helpers.arrayElement(["STUDENT_REPORTED", "INSTRUCTOR_REPORTED"]),
              verificationStatus: verified ? "VERIFIED" : undefined,
              verificationMethod: verified ? faker.helpers.arrayElement(["Employer contact", "Graduate self-report", "LinkedIn"]) : undefined,
              verifiedBy: verified ? faker.helpers.arrayElement(careerServicesStaff)?.name : undefined,
              verificationDate: verified ? addMonths(employmentStartDate, randomInt(0, 2)) : undefined,
            };
            break;
          case "continuingEd":
            outcomeData = { ...base, continuingEducationStatus: "ENROLLED" };
            break;
          case "military":
            outcomeData = { ...base, militaryStatus: "ENTERED_MILITARY" };
            break;
          case "awaitingLicensure":
            outcomeData = { ...base };
            break;
          case "unavailable":
            outcomeData = {
              ...base,
              availabilityForEmploymentStatus: faker.helpers.arrayElement([
                "UNAVAILABLE_HEALTH_OR_FAMILY",
                "UNAVAILABLE_INCARCERATED",
                "UNAVAILABLE_DECEASED",
              ]),
            };
            break;
          case "refused":
            outcomeData = { ...base, availabilityForEmploymentStatus: "REFUSED_EMPLOYMENT" };
            break;
          case "employedUnrelated":
            outcomeData = {
              ...base,
              employmentStatus: "EMPLOYED",
              employerId: employer.id,
              jobTitle,
              employmentStartDate,
              relatedToTraining: false,
              verificationStatus: verified ? "VERIFIED" : undefined,
              verificationDate: verified ? addMonths(employmentStartDate, randomInt(0, 2)) : undefined,
            };
            break;
          case "seekingUnknown":
            outcomeData = {
              ...base,
              employmentStatus: faker.helpers.arrayElement(["UNEMPLOYED", "UNKNOWN"]),
            };
            break;
        }

        const outcomeRecord = await prisma.studentOutcomeRecord.create({
          data: { studentEnrollmentId: enrollment.id, ...outcomeData },
        });

        if (bucket === "employedRelated" || bucket === "employedUnrelated") {
          const employmentRecord = await prisma.employmentRecord.create({
            data: {
              studentId: student.id,
              employerId: employer.id,
              jobTitle,
              startDate: employmentStartDate,
              fullTime: chance(0.8),
              relatedToTraining: bucket === "employedRelated",
              relationshipDeterminationMethod:
                bucket === "employedRelated" ? "Job title and duties match program curriculum" : undefined,
              salaryOrWage: randomInt(28000, 68000),
              employmentStatus: "EMPLOYED",
              verificationStatus: verified ? "VERIFIED" : undefined,
              verificationDate: verified ? addMonths(employmentStartDate, randomInt(0, 2)) : undefined,
              verificationSource: verified ? "Employer contact" : undefined,
            },
          });

          if (withEvidence) {
            const { fileReference } = await storage.save({
              buffer: Buffer.from(
                `Employer verification\n\nStudent: ${firstName} ${lastName}\nEmployer: ${employer.id}\nPosition: ${jobTitle}\nStart date: ${employmentStartDate.toDateString()}\n\nConfirmed by phone call with the employer's HR contact.`,
              ),
              originalName: "employer-verification.txt",
              mimeType: "text/plain",
            });
            await prisma.evidence.create({
              data: {
                outcomeRecordId: outcomeRecord.id,
                evidenceType: "EMPLOYER_VERIFICATION",
                fileReference,
                description: "Phone verification with employer HR contact.",
                uploadedBy: faker.helpers.arrayElement(careerServicesStaff)?.name ?? "Career Services",
              },
            });
            await prisma.evidence.create({
              data: {
                employmentRecordId: employmentRecord.id,
                evidenceType: "EMPLOYMENT_DOCUMENTATION",
                fileReference,
                description: "Same verification, attached to the employment history record.",
                uploadedBy: faker.helpers.arrayElement(careerServicesStaff)?.name ?? "Career Services",
              },
            });
          }
        }

        // Licensure results for graduate completers of licensure-required programs,
        // independent of placement bucket (a student can be employed AND awaiting/passed licensure).
        if (enrollmentStatus === "GRADUATE_COMPLETER" && config.licensureRequired) {
          if (chance(0.05)) {
            // Deliberate "missing licensure result" data-quality issue.
          } else {
            let result: LicensureResultStatus;
            if (bucket === "awaitingLicensure") {
              result = faker.helpers.arrayElement<LicensureResultStatus>(["WAITING", "SCHEDULED"]);
            } else {
              result = weightedPick<LicensureResultStatus>([
                ["PASSED", config.targets.licensure ?? 0.75],
                ["FAILED", 1 - (config.targets.licensure ?? 0.75)],
              ]);
            }
            const licensureResult = await prisma.licensureResult.create({
              data: {
                studentId: student.id,
                programId,
                examName: config.licensureExamName ?? "Licensure Exam",
                examDate: result === "WAITING" || result === "SCHEDULED" ? undefined : addMonths(completionDate!, 1),
                scheduledDate: result === "SCHEDULED" ? addMonths(completionDate!, 2) : undefined,
                result,
              },
            });
            if (result === "PASSED" && chance(0.4)) {
              const { fileReference } = await storage.save({
                buffer: Buffer.from(
                  `Licensure result\n\nStudent: ${firstName} ${lastName}\nExam: ${config.licensureExamName}\nResult: PASSED`,
                ),
                originalName: "licensure-result.txt",
                mimeType: "text/plain",
              });
              await prisma.evidence.create({
                data: {
                  licensureResultId: licensureResult.id,
                  evidenceType: "LICENSURE_RESULT",
                  fileReference,
                  description: "Official exam result notice.",
                  uploadedBy: "Career Services",
                },
              });
            }
          }
        }

        // Follow-up attempts, mostly for graduate completers.
        if (enrollmentStatus === "GRADUATE_COMPLETER" && chance(0.65) && careerServicesStaff.length > 0) {
          const attemptCount = randomInt(1, 3);
          const outcomeForBucket: Record<string, string> = {
            employedRelated: "EMPLOYMENT_VERIFIED",
            employedUnrelated: "EMPLOYMENT_REPORTED",
            continuingEd: "CONTINUING_EDUCATION",
            military: "STUDENT_CONTACTED",
            awaitingLicensure: "STUDENT_CONTACTED",
            unavailable: "UNAVAILABLE",
            refused: "STUDENT_CONTACTED",
            seekingUnknown: faker.helpers.arrayElement(["SEEKING_EMPLOYMENT", "NO_RESPONSE"]),
          };
          for (let a = 0; a < attemptCount; a++) {
            const attemptedAt = addMonths(completionDate!, a + 1);
            const isLast = a === attemptCount - 1;
            await prisma.followUpAttempt.create({
              data: {
                studentId: student.id,
                staffUserId: faker.helpers.arrayElement(careerServicesStaff).id,
                attemptedAt,
                method: faker.helpers.arrayElement(["PHONE", "EMAIL", "SMS", "SURVEY"]),
                outcome: (isLast
                  ? outcomeForBucket[bucket]
                  : faker.helpers.arrayElement(["NO_RESPONSE", "STUDENT_CONTACTED"])) as never,
                nextFollowUpDate:
                  isLast && (bucket === "seekingUnknown" || bucket === "unavailable")
                    ? addMonths(attemptedAt, 1)
                    : undefined,
              },
            });
          }
        }
      }
    }
  }

  console.log(`Created ${allNamedStudents.length} enrollments.`);

  console.log("Injecting deliberate duplicate-student candidates...");
  for (let i = 0; i < 8; i++) {
    const source = faker.helpers.arrayElement(allNamedStudents);
    internalIdCounter++;
    await prisma.student.create({
      data: {
        institutionId: institution.id,
        internalStudentId: `MWTC-${internalIdCounter}`,
        firstName: source.firstName,
        lastName: source.lastName,
        email: chance(0.5) ? faker.internet.email({ firstName: source.firstName, lastName: source.lastName }) : undefined,
      },
    });
  }

  console.log("Computing CPL results and running validation for every reporting period...");
  for (const period of PERIODS) {
    const reportingPeriod = periodByYear.get(period.year)!;
    await computeReportingPeriod(reportingPeriod.id);
    await runValidation(reportingPeriod.id);
    console.log(`  ${period.label}: computed + validated`);
  }

  console.log("Finalizing historical reporting periods...");
  const ada = usersByRole["INSTITUTIONAL_ADMINISTRATOR"]![0];
  for (const period of PERIODS) {
    if (period.status === "OPEN") continue;
    const reportingPeriod = periodByYear.get(period.year)!;
    await prisma.reportingPeriod.update({
      where: { id: reportingPeriod.id },
      data: {
        status: period.status,
        finalizedAt: new Date(`${period.year + 1}-01-15T00:00:00.000Z`),
        finalizedBy: ada.name,
      },
    });
  }

  // Show that "resolved" validation issues exist too, not just open ones.
  const period2025 = periodByYear.get(2025)!;
  const issuesToResolve = await prisma.validationIssue.findMany({
    where: { reportingPeriodId: period2025.id, resolvedAt: null },
    take: 2,
  });
  for (const issue of issuesToResolve) {
    await prisma.validationIssue.update({
      where: { id: issue.id },
      data: { resolvedAt: new Date("2026-01-20T00:00:00.000Z"), resolvedBy: ada.name },
    });
  }

  const studentCount = await prisma.student.count();
  const employerCount = await prisma.employer.count();
  console.log(`\nDone. ${studentCount} students, ${employerCount} employers, ${PROGRAMS.length} programs, ${PERIODS.length} reporting periods.`);
  console.log('Demo login: ada@mwtc.edu / password123 (all seeded users share this password).');
}

async function wipeDatabase() {
  await prisma.notification.deleteMany();
  await prisma.importRowError.deleteMany();
  await prisma.importBatch.deleteMany();
  await prisma.importMappingProfile.deleteMany();
  await prisma.improvementPlanUpdate.deleteMany();
  await prisma.improvementPlan.deleteMany();
  await prisma.studentMergeLog.deleteMany();
  await prisma.auditLogEntry.deleteMany();
  await prisma.communicationEvent.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.verificationRecord.deleteMany();
  await prisma.employerSurveyResponse.deleteMany();
  await prisma.employerSurvey.deleteMany();
  await prisma.graduateSurveyResponse.deleteMany();
  await prisma.graduateSurvey.deleteMany();
  await prisma.licensureResult.deleteMany();
  await prisma.employmentRecord.deleteMany();
  await prisma.studentOutcomeRecord.deleteMany();
  await prisma.validationIssue.deleteMany();
  await prisma.cplCalculationExplanation.deleteMany();
  await prisma.studentClassification.deleteMany();
  await prisma.cplCalculationResult.deleteMany();
  await prisma.reportingPeriod.deleteMany();
  await prisma.ruleSet.deleteMany();
  await prisma.accreditationFramework.deleteMany();
  await prisma.studentEnrollment.deleteMany();
  await prisma.studentDemographics.deleteMany();
  await prisma.studentCommunicationPreference.deleteMany();
  await prisma.followUpAttempt.deleteMany();
  await prisma.student.deleteMany();
  await prisma.employerContact.deleteMany();
  await prisma.employer.deleteMany();
  await prisma.userProgramAccess.deleteMany();
  await prisma.userCampusAccess.deleteMany();
  await prisma.user.deleteMany();
  await prisma.cohort.deleteMany();
  await prisma.program.deleteMany();
  await prisma.department.deleteMany();
  await prisma.campus.deleteMany();
  await prisma.institution.deleteMany();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
