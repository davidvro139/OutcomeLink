import { runValidation } from "./validationEngine";
import { prisma } from "../../../lib/prisma";

/**
 * Targeted coverage for the EMPLOYER_MISSING_VERIFIABLE_CONTACT check
 * (docs/TODO.md §9, sourced from docs/Outcomes and CPL slides.pdf: "we must
 * be able to find the employer's address or phone number, at least ...
 * must be verifiable"). The rest of runValidation() has been exercised
 * ad hoc against the demo dataset (docs/TODO.md stage 8) rather than unit
 * tested individually — this file covers only the newly added check.
 */
describe("runValidation — EMPLOYER_MISSING_VERIFIABLE_CONTACT (integration)", () => {
  let institutionId: number;
  let programId: number;
  let campusId: number;
  let reportingPeriodId: number;

  async function makeEmployedStudent(label: string, employerId: number | null) {
    const student = await prisma.student.create({
      data: { institutionId, internalStudentId: `VALID-${label}`, firstName: "Test", lastName: label },
    });
    const enrollment = await prisma.studentEnrollment.create({
      data: {
        studentId: student.id,
        programId,
        campusId,
        startDate: new Date("2025-01-01"),
        actualCompletionDate: new Date("2026-01-15"),
        enrollmentStatus: "GRADUATE_COMPLETER",
      },
    });
    await prisma.studentOutcomeRecord.create({
      data: {
        studentEnrollmentId: enrollment.id,
        reportingPeriodId,
        licensureRequired: false,
        employmentStatus: "EMPLOYED",
        relatedToTraining: true,
        relatedToTrainingJustification: "Matches program curriculum.",
        verificationStatus: "VERIFIED",
        employerId: employerId ?? undefined,
      },
    });
    return student.id;
  }

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Validation Test Institution" } });
    institutionId = institution.id;

    const campus = await prisma.campus.create({ data: { institutionId, name: "Main Campus" } });
    campusId = campus.id;

    const program = await prisma.program.create({
      data: { institutionId, campusId, name: "Test Program", code: "VP-100", credentialType: "Diploma" },
    });
    programId = program.id;

    const framework = await prisma.accreditationFramework.create({ data: { name: "COE-VALID-TEST" } });
    const ruleSet = await prisma.ruleSet.create({
      data: {
        frameworkId: framework.id,
        versionLabel: "COE-2026-VALID-TEST",
        effectiveStartDate: new Date("2025-01-01"),
        ruleDefinition: { benchmarks: { completion: 60, placement: 70, licensure: 70 } },
      },
    });
    const period = await prisma.reportingPeriod.create({
      data: {
        institutionId,
        ruleSetId: ruleSet.id,
        label: "VALID-TEST-PERIOD",
        startDate: new Date("2025-07-01"),
        endDate: new Date("2026-06-30"),
      },
    });
    reportingPeriodId = period.id;

    const unverifiableEmployer = await prisma.employer.create({
      data: { institutionId, name: "No Contact Info LLC" },
    });
    const employerWithAddress = await prisma.employer.create({
      data: { institutionId, name: "Has Address Inc", address: "123 Main St", city: "Denver" },
    });
    const employerWithPhoneOnly = await prisma.employer.create({
      data: { institutionId, name: "Has Phone Only Co" },
    });
    await prisma.employerContact.create({
      data: { employerId: employerWithPhoneOnly.id, name: "HR Contact", phone: "555-0100" },
    });

    await makeEmployedStudent("Unverifiable", unverifiableEmployer.id);
    await makeEmployedStudent("HasAddress", employerWithAddress.id);
    await makeEmployedStudent("HasPhoneOnly", employerWithPhoneOnly.id);

    await runValidation(reportingPeriodId);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("flags an employed outcome whose employer has neither an address nor any contact phone on file", async () => {
    const student = await prisma.student.findFirst({ where: { internalStudentId: "VALID-Unverifiable" } });
    const issue = await prisma.validationIssue.findFirst({
      where: { reportingPeriodId, studentId: student!.id, issueType: "EMPLOYER_MISSING_VERIFIABLE_CONTACT" },
    });
    expect(issue).not.toBeNull();
    expect(issue?.severity).toBe("WARNING");
  });

  it("does not flag an employer with an address on file", async () => {
    const student = await prisma.student.findFirst({ where: { internalStudentId: "VALID-HasAddress" } });
    const issue = await prisma.validationIssue.findFirst({
      where: { reportingPeriodId, studentId: student!.id, issueType: "EMPLOYER_MISSING_VERIFIABLE_CONTACT" },
    });
    expect(issue).toBeNull();
  });

  it("does not flag an employer with only a contact phone number on file", async () => {
    const student = await prisma.student.findFirst({ where: { internalStudentId: "VALID-HasPhoneOnly" } });
    const issue = await prisma.validationIssue.findFirst({
      where: { reportingPeriodId, studentId: student!.id, issueType: "EMPLOYER_MISSING_VERIFIABLE_CONTACT" },
    });
    expect(issue).toBeNull();
  });
});
