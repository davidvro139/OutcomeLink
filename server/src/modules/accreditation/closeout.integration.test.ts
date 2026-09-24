import request from "supertest";
import { createApp } from "../../app";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import { runWithRequestContext } from "../../lib/requestContext";

const app = createApp();

interface StepJson {
  id: string;
  state: string;
  action: string | null;
}
interface CloseoutJson {
  locked: boolean;
  status: string;
  steps: StepJson[];
  blockers: { code: string; message: string }[];
  signOffCurrent: boolean;
  canFinalize: boolean;
  needsOverride: boolean;
  signOff: { by: string; note: string | null } | null;
  finalizeOverrideReason: string | null;
}

/**
 * Close-out checklist (docs/TODO.md): the ordered steps, what blocks finalizing,
 * the required sign-off (which goes stale when results or data change), and the
 * override-with-a-reason path — against the real endpoints.
 */
describe("reporting-period close-out (integration)", () => {
  let institutionId: number;
  let otherInstitutionId: number;
  let programId: number;
  let periodId: number; // "good" period: everything meets its benchmark
  let badPeriodId: number; // "bad" period: an off-track program
  let badProgramId: number;
  let adminId: number;
  let adminToken: string;
  let programAdminToken: string;
  let careerToken: string;
  let otherAdminToken: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const path = (id: number, suffix = "") => `/api/accreditation/reporting-periods/${id}${suffix}`;
  const closeout = async (token: string, id = periodId) =>
    (await request(app).get(path(id, "/closeout")).set(auth(token))).body.data as CloseoutJson;
  const post = (token: string, url: string, body: object = {}) =>
    request(app).post(url).set(auth(token)).send(body);
  const computeAndValidate = async (id: number) => {
    // Small gap so a later timestamp is strictly later than an earlier one (DATETIME(3)).
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect((await post(adminToken, path(id, "/compute"))).status).toBeLessThan(300);
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect((await post(adminToken, path(id, "/validate"))).status).toBeLessThan(300);
    await new Promise((resolve) => setTimeout(resolve, 15));
  };

  async function completer(
    inst: number,
    prog: number,
    campus: number,
    period: number,
    label: string,
    related: boolean,
  ) {
    const student = await prisma.student.create({
      data: {
        institutionId: inst,
        internalStudentId: `CO-${label}`,
        firstName: label,
        lastName: "Student",
      },
    });
    const enrollment = await prisma.studentEnrollment.create({
      data: {
        studentId: student.id,
        programId: prog,
        campusId: campus,
        startDate: new Date("2025-01-01"),
        actualCompletionDate: new Date("2026-01-01"),
        enrollmentStatus: "GRADUATE_COMPLETER",
      },
    });
    await prisma.studentOutcomeRecord.create({
      data: {
        studentEnrollmentId: enrollment.id,
        reportingPeriodId: period,
        licensureRequired: false,
        employmentStatus: "EMPLOYED",
        relatedToTraining: related,
        ...(related ? { relatedToTrainingJustification: "Matches curriculum." } : {}),
        verificationStatus: "VERIFIED",
      },
    });
    return enrollment.id;
  }

  let firstEnrollmentId: number;

  beforeAll(async () => {
    institutionId = (await prisma.institution.create({ data: { name: "Closeout Test College" } }))
      .id;
    otherInstitutionId = (
      await prisma.institution.create({ data: { name: "Other Closeout College" } })
    ).id;
    const campusId = (await prisma.campus.create({ data: { institutionId, name: "Main" } })).id;
    programId = (
      await prisma.program.create({
        data: {
          institutionId,
          campusId,
          name: "Automotive",
          code: "CO-AUTO",
          credentialType: "Diploma",
        },
      })
    ).id;
    badProgramId = (
      await prisma.program.create({
        data: {
          institutionId,
          campusId,
          name: "Welding",
          code: "CO-WELD",
          credentialType: "Diploma",
        },
      })
    ).id;

    const passwordHash = await hashPassword("password123");
    const make = (
      inst: number,
      email: string,
      role:
        | "SYSTEM_ADMINISTRATOR"
        | "PROGRAM_ADMINISTRATOR"
        | "CAREER_SERVICES_STAFF"
        | "INSTITUTIONAL_ADMINISTRATOR",
    ) =>
      prisma.user.create({
        data: { institutionId: inst, name: email.split("@")[0]!, email, passwordHash, role },
      });
    adminId = (await make(institutionId, "admin@closeout-test.edu", "SYSTEM_ADMINISTRATOR")).id;
    await make(institutionId, "pa@closeout-test.edu", "PROGRAM_ADMINISTRATOR");
    await make(institutionId, "career@closeout-test.edu", "CAREER_SERVICES_STAFF");
    await make(otherInstitutionId, "admin@other-closeout-test.edu", "INSTITUTIONAL_ADMINISTRATOR");
    const login = async (email: string) =>
      (await request(app).post("/api/auth/login").send({ email, password: "password123" })).body
        .data.accessToken as string;
    adminToken = await login("admin@closeout-test.edu");
    programAdminToken = await login("pa@closeout-test.edu");
    careerToken = await login("career@closeout-test.edu");
    otherAdminToken = await login("admin@other-closeout-test.edu");

    const framework = await prisma.accreditationFramework.create({
      data: { name: "COE-CLOSEOUT-TEST" },
    });
    const ruleSet = await prisma.ruleSet.create({
      data: {
        frameworkId: framework.id,
        versionLabel: "COE-2026-CLOSEOUT-TEST",
        effectiveStartDate: new Date("2025-01-01"),
        ruleDefinition: { benchmarks: { completion: 60, placement: 70, licensure: 70 } },
      },
    });
    const period = (label: string, start: string, end: string) =>
      prisma.reportingPeriod.create({
        data: {
          institutionId,
          ruleSetId: ruleSet.id,
          label,
          startDate: new Date(start),
          endDate: new Date(end),
        },
      });
    periodId = (await period("CO-GOOD", "2025-07-01", "2026-06-30")).id;
    badPeriodId = (await period("CO-BAD", "2024-07-01", "2025-06-30")).id;

    // Good period: every completer employed in a related job.
    for (let i = 0; i < 4; i++) {
      const id = await completer(institutionId, programId, campusId, periodId, `good-${i}`, true);
      if (i === 0) firstEnrollmentId = id;
    }
    // Bad period (an earlier window, completing in 2024-25): a program that can't reach its placement benchmark.
    for (let i = 0; i < 10; i++) {
      const student = await prisma.student.create({
        data: {
          institutionId,
          internalStudentId: `CO-bad-${i}`,
          firstName: `bad-${i}`,
          lastName: "Student",
        },
      });
      const enrollment = await prisma.studentEnrollment.create({
        data: {
          studentId: student.id,
          programId: badProgramId,
          campusId,
          startDate: new Date("2024-01-01"),
          actualCompletionDate: new Date("2025-01-01"),
          enrollmentStatus: "GRADUATE_COMPLETER",
        },
      });
      await prisma.studentOutcomeRecord.create({
        data: {
          studentEnrollmentId: enrollment.id,
          reportingPeriodId: badPeriodId,
          licensureRequired: false,
          employmentStatus: "EMPLOYED",
          relatedToTraining: i < 2,
          ...(i < 2 ? { relatedToTrainingJustification: "Matches curriculum." } : {}),
          verificationStatus: "VERIFIED",
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("starts with nothing done: results and validation missing, sign-off and finalize held back", async () => {
    const c = await closeout(adminToken);
    expect(c.steps.map((s) => s.id)).toEqual([
      "deadline",
      "compute",
      "validate",
      "errors",
      "review",
      "signoff",
      "finalize",
      "submit",
    ]);
    expect(c.blockers.map((b) => b.code)).toEqual([
      "RESULTS_MISSING_OR_STALE",
      "VALIDATION_NOT_CURRENT",
    ]);
    expect(c.steps.find((s) => s.id === "compute")).toMatchObject({
      state: "TODO",
      action: "COMPUTE",
    });
    expect(c.steps.find((s) => s.id === "finalize")!.state).toBe("BLOCKED");
    expect(c.canFinalize).toBe(false);
  });

  it("is scoped to the caller's institution", async () => {
    expect(
      (await request(app).get(path(periodId, "/closeout")).set(auth(otherAdminToken))).status,
    ).toBe(404);
  });

  it("refuses sign-off before results exist, and finalize without a sign-off", async () => {
    const early = await post(adminToken, path(periodId, "/closeout/sign-off"));
    expect(early.status).toBe(409);
    expect(early.body.error.message).toContain("Compute results");

    const noSignOff = await post(adminToken, path(periodId, "/finalize"));
    expect(noSignOff.status).toBe(409);
    expect(noSignOff.body.error.code).toBe("CLOSEOUT_BLOCKED");
    expect(noSignOff.body.error.details.signOffRequired).toBe(true);
    expect(
      (await prisma.reportingPeriod.findUniqueOrThrow({ where: { id: periodId } })).status,
    ).toBe("OPEN");
  });

  it("only administrators can sign off or finalize", async () => {
    for (const token of [programAdminToken, careerToken]) {
      expect((await post(token, path(periodId, "/closeout/sign-off"))).status).toBe(403);
      expect((await post(token, path(periodId, "/finalize"))).status).toBe(403);
    }
    // ...but anyone who can see the period can read the checklist.
    expect(
      (await request(app).get(path(periodId, "/closeout")).set(auth(programAdminToken))).status,
    ).toBe(200);
  });

  it("walks the happy path: compute, validate, sign off, finalize with no override, submit", async () => {
    await computeAndValidate(periodId);
    const ready = await closeout(adminToken);
    expect(ready.blockers).toEqual([]);
    expect(ready.steps.find((s) => s.id === "compute")!.state).toBe("DONE");
    expect(ready.steps.find((s) => s.id === "validate")!.state).toBe("DONE");
    expect(ready.steps.find((s) => s.id === "signoff")).toMatchObject({
      state: "TODO",
      action: "SIGN_OFF",
    });

    const signed = await post(adminToken, path(periodId, "/closeout/sign-off"), {
      note: "Reviewed with the deans",
    });
    expect(signed.status).toBe(200);
    expect(signed.body.data).toMatchObject({
      signOffCurrent: true,
      canFinalize: true,
      needsOverride: false,
    });
    expect(signed.body.data.signOff).toMatchObject({
      by: "admin",
      note: "Reviewed with the deans",
    });

    const finalized = await post(adminToken, path(periodId, "/finalize"));
    expect(finalized.status).toBe(200);
    expect(finalized.body.data.reportingPeriod).toMatchObject({
      status: "FINALIZED",
      finalizeOverrideReason: null,
    });

    const locked = await closeout(adminToken);
    expect(locked.locked).toBe(true);
    expect(
      locked.steps
        .filter((s) => s.id !== "submit" && s.id !== "deadline")
        .every((s) => s.state === "LOCKED"),
    ).toBe(true);
    expect(locked.steps.find((s) => s.id === "submit")).toMatchObject({
      state: "TODO",
      action: "SUBMIT",
    });

    expect((await post(adminToken, path(periodId, "/submit"))).status).toBe(200);
    expect((await closeout(adminToken)).steps.find((s) => s.id === "submit")!.state).toBe("DONE");
  });

  it("reopening clears the sign-off, so the period has to be reviewed and signed off again", async () => {
    const reopened = await post(adminToken, path(periodId, "/reopen"), {
      reason: "A late outcome came in",
    });
    expect(reopened.status).toBe(200);
    const row = await prisma.reportingPeriod.findUniqueOrThrow({ where: { id: periodId } });
    expect(row).toMatchObject({
      signedOffAt: null,
      signedOffBy: null,
      signedOffNote: null,
      signedOffResultsAt: null,
      finalizeOverrideReason: null,
    });
    const c = await closeout(adminToken);
    expect(c.signOffCurrent).toBe(false);
    expect((await post(adminToken, path(periodId, "/finalize"))).status).toBe(409);
  });

  it("a data change after results were computed makes them stale, and after sign-off makes the sign-off stale", async () => {
    // Fresh compute, validation and sign-off...
    await computeAndValidate(periodId);
    expect((await post(adminToken, path(periodId, "/closeout/sign-off"))).status).toBe(200);
    expect((await closeout(adminToken)).signOffCurrent).toBe(true);

    // ...then someone edits an enrollment (audited, as it would be through the API).
    await new Promise((resolve) => setTimeout(resolve, 15));
    // (async wrapper: a bare Prisma promise is lazy and would run outside the request context, so nothing would be audited)
    await runWithRequestContext({ userId: adminId }, async () => {
      await prisma.studentEnrollment.update({
        where: { id: firstEnrollmentId },
        data: { credentialEarned: "Diploma" },
      });
    });
    const stale = await closeout(adminToken);
    expect(stale.signOffCurrent).toBe(false);
    expect(stale.blockers.map((b) => b.code)).toEqual([
      "RESULTS_MISSING_OR_STALE",
      "VALIDATION_NOT_CURRENT",
    ]);
    expect(stale.steps.find((s) => s.id === "compute")).toMatchObject({
      state: "TODO",
      action: "COMPUTE",
    });

    // Can't finalize on the stale sign-off; recomputing, revalidating and signing off again fixes it.
    expect((await post(adminToken, path(periodId, "/finalize"))).status).toBe(409);
    await computeAndValidate(periodId);
    expect((await closeout(adminToken)).signOffCurrent).toBe(false); // recompute after the sign-off also invalidates it
    expect((await post(adminToken, path(periodId, "/closeout/sign-off"))).status).toBe(200);
    expect((await closeout(adminToken)).blockers).toEqual([]);
  });

  describe("blockers and overrides", () => {
    it("blocks an off-track program with no improvement plan, and stops blocking once it has one", async () => {
      await computeAndValidate(badPeriodId);
      const c = await closeout(adminToken, badPeriodId);
      expect(c.blockers).toEqual([
        { code: "OFF_TRACK_WITHOUT_PLAN", message: expect.stringContaining("Welding (placement)") },
      ]);
      expect(c.steps.find((s) => s.id === "review")!.state).toBe("TODO");

      await prisma.improvementPlan.create({
        data: {
          programId: badProgramId,
          metric: "PLACEMENT",
          reportingPeriodId: badPeriodId,
          responsibleUserId: adminId,
          status: "ACTIVE",
        },
      });
      const planned = await closeout(adminToken, badPeriodId);
      expect(planned.blockers).toEqual([]);
      expect(planned.steps.find((s) => s.id === "review")!.state).toBe("DONE");
      await prisma.improvementPlan.deleteMany({ where: { reportingPeriodId: badPeriodId } });
    });

    it("refuses finalize with blockers unless an override reason is given, then records it and audits it", async () => {
      // Sign off with the off-track blocker outstanding (sign-off itself is allowed), then try to finalize.
      expect((await post(adminToken, path(badPeriodId, "/closeout/sign-off"))).status).toBe(200);
      const blocked = await post(adminToken, path(badPeriodId, "/finalize"));
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe("CLOSEOUT_BLOCKED");
      expect(blocked.body.error.details.blockers.map((b: { code: string }) => b.code)).toEqual([
        "OFF_TRACK_WITHOUT_PLAN",
      ]);
      expect(blocked.body.error.message).toContain("override reason");

      const overridden = await post(adminToken, path(badPeriodId, "/finalize"), {
        overrideReason: "COE approved an exception for Welding placement",
      });
      expect(overridden.status).toBe(200);
      expect(overridden.body.data.reportingPeriod).toMatchObject({
        status: "FINALIZED",
        finalizeOverrideReason: "COE approved an exception for Welding placement",
      });

      // Sign-off and the override reason are recorded in the period's audit trail like the rest of the lifecycle.
      const audited = await prisma.auditLogEntry.findMany({
        where: { entityType: "ReportingPeriod", entityId: badPeriodId },
        select: { fieldChanged: true },
      });
      expect(audited.map((a) => a.fieldChanged)).toEqual(
        expect.arrayContaining(["signedOffAt", "finalizeOverrideReason", "status"]),
      );

      const shown = await closeout(adminToken, badPeriodId);
      expect(shown.finalizeOverrideReason).toBe("COE approved an exception for Welding placement");
      expect(shown.steps.find((s) => s.id === "finalize")!.state).toBe("LOCKED");
    });

    it("an open validation error blocks too, and an override reason is not needed when nothing blocks", async () => {
      await post(adminToken, path(badPeriodId, "/reopen"), { reason: "Recheck" });
      await prisma.improvementPlan.create({
        data: {
          programId: badProgramId,
          metric: "PLACEMENT",
          reportingPeriodId: badPeriodId,
          responsibleUserId: adminId,
          status: "ACTIVE",
        },
      });
      await computeAndValidate(badPeriodId);
      await prisma.validationIssue.create({
        data: {
          reportingPeriodId: badPeriodId,
          programId: badProgramId,
          issueType: "MISSING_COMPLETION_DATE",
          severity: "ERROR",
        },
      });
      expect((await closeout(adminToken, badPeriodId)).blockers.map((b) => b.code)).toEqual([
        "OPEN_ERRORS",
      ]);

      // A WARNING alone never blocks.
      await prisma.validationIssue.deleteMany({ where: { reportingPeriodId: badPeriodId } });
      await prisma.validationIssue.create({
        data: {
          reportingPeriodId: badPeriodId,
          programId: badProgramId,
          issueType: "MISSING_VERIFICATION",
          severity: "WARNING",
        },
      });
      const warned = await closeout(adminToken, badPeriodId);
      expect(warned.blockers).toEqual([]);
      expect(warned.steps.find((s) => s.id === "errors")!.state).toBe("DONE");

      await post(adminToken, path(badPeriodId, "/closeout/sign-off"));
      const finalized = await post(adminToken, path(badPeriodId, "/finalize"));
      expect(finalized.status).toBe(200);
      expect(finalized.body.data.reportingPeriod.finalizeOverrideReason).toBeNull();
    });
  });
});
