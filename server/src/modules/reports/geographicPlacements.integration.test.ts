import request from "supertest";
import { createApp } from "../../app";
import { prisma } from "../../lib/prisma";
import { signAccessToken } from "../../lib/jwt";

const app = createApp();
describe("geographic placements", () => {
  let token: string;
  let scopedToken: string;
  let noAccessToken: string;
  let periodId: number;
  let foreignPeriodId: number;
  let emptyPeriodId: number;
  let employerId: number;
  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Geography test" } });
    const foreign = await prisma.institution.create({ data: { name: "Other geography institution" } });
    const campus = await prisma.campus.create({ data: { institutionId: institution.id, name: "Main" } });
    const programs = await Promise.all(["A", "B"].map((code) => prisma.program.create({
      data: { institutionId: institution.id, campusId: campus.id, name: code, code, credentialType: "Diploma" },
    })));
    const admin = await prisma.user.create({ data: {
      institutionId: institution.id, name: "Geo Admin", email: "geo-admin@test.edu", passwordHash: "unused", role: "SYSTEM_ADMINISTRATOR",
    } });
    const scoped = await prisma.user.create({ data: {
      institutionId: institution.id, name: "Geo Scoped", email: "geo-scoped@test.edu", passwordHash: "unused", role: "PROGRAM_ADMINISTRATOR",
    } });
    const noAccess = await prisma.user.create({ data: {
      institutionId: institution.id, name: "Geo Auditor", email: "geo-auditor@test.edu", passwordHash: "unused", role: "READ_ONLY_AUDITOR",
    } });
    await prisma.userProgramAccess.create({ data: { userId: scoped.id, programId: programs[0]!.id } });
    token = signAccessToken({ sub: admin.id, institutionId: institution.id, role: admin.role });
    scopedToken = signAccessToken({ sub: scoped.id, institutionId: institution.id, role: scoped.role });
    noAccessToken = signAccessToken({ sub: noAccess.id, institutionId: institution.id, role: noAccess.role });
    const framework = await prisma.accreditationFramework.create({ data: { name: "GEO" } });
    const ruleSet = await prisma.ruleSet.create({ data: {
      frameworkId: framework.id, versionLabel: "GEO", effectiveStartDate: new Date("2025-01-01"), ruleDefinition: {},
    } });
    for (const [label, institutionId, year] of [["geo", institution.id, 2026], ["foreign", foreign.id, 2026], ["empty", institution.id, 2020]] as const) {
      const period = await prisma.reportingPeriod.create({ data: {
        institutionId, ruleSetId: ruleSet.id, label,
        startDate: new Date(`${year}-01-01`), endDate: new Date(`${year}-12-31`),
      } });
      if (label === "geo") periodId = period.id;
      if (label === "foreign") foreignPeriodId = period.id;
      if (label === "empty") emptyPeriodId = period.id;
    }
    const mapped = await prisma.employer.create({ data: {
      institutionId: institution.id, name: "Mapped", city: "Denver", state: "CO",
    } });
    employerId = mapped.id;
    const unmapped = await prisma.employer.create({ data: { institutionId: institution.id, name: "Unmapped" } });
    const sameCity = await prisma.employer.create({ data: { institutionId: institution.id, name: "Same city", city: " denver ", state: "Colorado" } });
    for (const [index, program] of programs.entries()) {
      const student = await prisma.student.create({ data: {
        institutionId: institution.id, internalStudentId: `GEO-${index}`, firstName: "Geo", lastName: String(index),
      } });
      await prisma.studentEnrollment.create({ data: {
        studentId: student.id, programId: program.id, campusId: campus.id, startDate: new Date("2025-01-01"), enrollmentStatus: "GRADUATE_COMPLETER",
      } });
      for (const [employer, startDate] of [[mapped, "2026-01-01"], [sameCity, "2026-12-31"], [unmapped, "2026-06-01"], [mapped, "2025-12-31"], [mapped, "2027-01-01"]] as const) {
        await prisma.employmentRecord.create({ data: {
          studentId: student.id, employerId: employer.id, jobTitle: "Technician", startDate: new Date(startDate),
          fullTime: true, relatedToTraining: true, employmentStatus: "EMPLOYED",
        } });
      }
    }
  });
  const report = (auth = token, id = periodId) => request(app)
    .get(`/api/reports/geographic-placements?reportingPeriodId=${id}`).set("Authorization", `Bearer ${auth}`);

  it("counts jobs at both period boundaries and groups normalized city/state values", async () => {
    const res = await report();
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ totalPlacements: 6, mappedPlacements: 4, unmappedPlacements: 2 });
    expect(res.body.data.locations).toHaveLength(2);
    expect(res.body.data.locations[0]).toMatchObject({ city: "Denver", state: "CO", placementCount: 4 });
    expect(res.body.data.locations[0].latitude).toBeCloseTo(39.7, 0);
    expect(res.body.data.locations[0].employers).toHaveLength(2);
  });
  it("restricts placement counts to accessible students", async () => {
    const res = await report(scopedToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ totalPlacements: 3, mappedPlacements: 2, unmappedPlacements: 1 });
    expect((await report(noAccessToken)).body.data.locations).toEqual([]);
  });
  it("returns an empty report for a period without placements", async () => {
    expect((await report(token, emptyPeriodId)).body.data).toEqual({ totalPlacements: 0, mappedPlacements: 0, unmappedPlacements: 0, locations: [] });
  });
  it("requires authentication, a valid period, and institution ownership", async () => {
    expect((await request(app).get(`/api/reports/geographic-placements?reportingPeriodId=${periodId}`)).status).toBe(401);
    expect((await report(token, foreignPeriodId)).status).toBe(404);
    expect((await report(token, -1)).status).toBe(400);
  });
  it("validates location values and enforces editing roles", async () => {
    for (const body of [{ city: 30 }, { city: "x".repeat(101) }]) {
      expect((await request(app).patch(`/api/employers/${employerId}`).set("Authorization", `Bearer ${token}`).send(body)).status).toBe(400);
    }
    expect((await request(app).patch(`/api/employers/${employerId}`).set("Authorization", `Bearer ${scopedToken}`).send({ city: "Boulder", state: "CO" })).status).toBe(403);
  });
  it("reflects city/state corrections and unknown places in report coverage", async () => {
    const patch = (body: { city: string; state: string }) => request(app).patch(`/api/employers/${employerId}`).set("Authorization", `Bearer ${token}`).send(body);
    expect((await patch({ city: "Boulder", state: "Colorado" })).status).toBe(200);
    expect((await report()).body.data.locations).toEqual(expect.arrayContaining([expect.objectContaining({ city: "Boulder", state: "CO", placementCount: 2 })]));
    expect((await patch({ city: "Unknown test city", state: "CO" })).status).toBe(200);
    expect((await report()).body.data).toMatchObject({ mappedPlacements: 2, unmappedPlacements: 4 });
  });
});
