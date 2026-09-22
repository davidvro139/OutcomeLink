import request from "supertest";
import { createApp } from "../../app";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";

const app = createApp();

describe("users (integration)", () => {
  let institutionId: number;
  let otherInstitutionId: number;
  let campusId: number;
  let programId: number;
  let systemAdminToken: string;
  let institutionalAdminToken: string;
  let programAdminToken: string;
  let otherAdminToken: string;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Users Test Institution" } });
    institutionId = institution.id;
    const otherInstitution = await prisma.institution.create({ data: { name: "Other Users Institution" } });
    otherInstitutionId = otherInstitution.id;

    const campus = await prisma.campus.create({ data: { institutionId, name: "Main Campus" } });
    campusId = campus.id;
    const program = await prisma.program.create({
      data: { institutionId, campusId, name: "Automotive Technology", code: "USR-AUTO", credentialType: "Diploma" },
    });
    programId = program.id;

    const passwordHash = await hashPassword("password123");
    await prisma.user.create({
      data: { institutionId, name: "SysAdmin", email: "sysadmin@users-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    await prisma.user.create({
      data: { institutionId, name: "InstAdmin", email: "instadmin@users-test.edu", passwordHash, role: "INSTITUTIONAL_ADMINISTRATOR" },
    });
    await prisma.user.create({
      data: { institutionId, name: "ProgAdmin", email: "progadmin@users-test.edu", passwordHash, role: "PROGRAM_ADMINISTRATOR" },
    });
    await prisma.user.create({
      data: { institutionId: otherInstitutionId, name: "Other Admin", email: "admin@other-users-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });

    systemAdminToken = (await request(app).post("/api/auth/login").send({ email: "sysadmin@users-test.edu", password: "password123" })).body.data.accessToken;
    institutionalAdminToken = (await request(app).post("/api/auth/login").send({ email: "instadmin@users-test.edu", password: "password123" })).body.data.accessToken;
    programAdminToken = (await request(app).post("/api/auth/login").send({ email: "progadmin@users-test.edu", password: "password123" })).body.data.accessToken;
    otherAdminToken = (await request(app).post("/api/auth/login").send({ email: "admin@other-users-test.edu", password: "password123" })).body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("invite", () => {
    it("rejects a Program Administrator from inviting a user", async () => {
      const res = await request(app)
        .post("/api/users/invite")
        .set("Authorization", `Bearer ${programAdminToken}`)
        .send({ name: "New Person", email: "new-person@users-test.edu", role: "INSTRUCTOR_STAFF" });
      expect(res.status).toBe(403);
    });

    it("lets a System Administrator invite a user scoped to their own institution, with no usable password yet", async () => {
      const res = await request(app)
        .post("/api/users/invite")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ name: "New Instructor", email: "new-instructor@users-test.edu", role: "INSTRUCTOR_STAFF" });

      expect(res.status).toBe(201);
      expect(res.body.data.user).toMatchObject({ name: "New Instructor", email: "new-instructor@users-test.edu", role: "INSTRUCTOR_STAFF", active: true });
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(res.body.data.user.passwordSetToken).toBeUndefined();
      expect(typeof res.body.data.token).toBe("string");

      const stored = await prisma.user.findUnique({ where: { email: "new-instructor@users-test.edu" } });
      expect(stored).toMatchObject({ institutionId });
      expect(stored!.passwordSetToken).toBe(res.body.data.token);

      // No password was ever set — logging in with any guess fails.
      const loginRes = await request(app).post("/api/auth/login").send({ email: "new-instructor@users-test.edu", password: "password123" });
      expect(loginRes.status).toBe(401);
    });

    it("lets an Institutional Administrator invite a user too", async () => {
      const res = await request(app)
        .post("/api/users/invite")
        .set("Authorization", `Bearer ${institutionalAdminToken}`)
        .send({ name: "Another Instructor", email: "another-instructor@users-test.edu", role: "CAREER_SERVICES_STAFF" });
      expect(res.status).toBe(201);
    });

    it("ignores any caller-supplied institutionId — an invited user always lands in the caller's own institution", async () => {
      const res = await request(app)
        .post("/api/users/invite")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ name: "Spoof Attempt", email: "spoof-attempt@users-test.edu", role: "INSTRUCTOR_STAFF", institutionId: otherInstitutionId });
      expect(res.status).toBe(201);

      const stored = await prisma.user.findUnique({ where: { email: "spoof-attempt@users-test.edu" } });
      expect(stored).toMatchObject({ institutionId });
    });

    it("rejects inviting a user with an already-used email", async () => {
      const res = await request(app)
        .post("/api/users/invite")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ name: "Duplicate", email: "new-instructor@users-test.edu", role: "INSTRUCTOR_STAFF" });
      expect(res.status).toBe(409);
    });
  });

  describe("list", () => {
    it("keeps invited users scoped to their own institution in the staff directory", async () => {
      const res = await request(app).get("/api/users").set("Authorization", `Bearer ${systemAdminToken}`);
      expect(res.body.data.users.map((u: { name: string }) => u.name)).toEqual(
        expect.arrayContaining(["New Instructor", "Another Instructor", "Spoof Attempt"]),
      );

      const otherRes = await request(app).get("/api/users").set("Authorization", `Bearer ${otherAdminToken}`);
      expect(otherRes.body.data.users.map((u: { name: string }) => u.name)).not.toEqual(
        expect.arrayContaining(["New Instructor"]),
      );
    });

    it("excludes inactive users by default, even for an admin, and includes them only with includeInactive as an admin", async () => {
      const invited = await request(app)
        .post("/api/users/invite")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ name: "Soon Inactive", email: "soon-inactive@users-test.edu", role: "INSTRUCTOR_STAFF" });
      await request(app)
        .patch(`/api/users/${invited.body.data.user.id}/active`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ active: false });

      const withoutFlag = await request(app).get("/api/users").set("Authorization", `Bearer ${systemAdminToken}`);
      expect(withoutFlag.body.data.users.map((u: { name: string }) => u.name)).not.toContain("Soon Inactive");

      const withFlag = await request(app).get("/api/users?includeInactive=true").set("Authorization", `Bearer ${systemAdminToken}`);
      expect(withFlag.body.data.users.map((u: { name: string }) => u.name)).toContain("Soon Inactive");

      // A non-admin's includeInactive request is silently ignored.
      const nonAdminWithFlag = await request(app).get("/api/users?includeInactive=true").set("Authorization", `Bearer ${programAdminToken}`);
      expect(nonAdminWithFlag.body.data.users.map((u: { name: string }) => u.name)).not.toContain("Soon Inactive");
    });
  });

  describe("update", () => {
    let userId: number;

    beforeAll(async () => {
      const res = await request(app)
        .post("/api/users/invite")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ name: "Editable Person", email: "editable@users-test.edu", role: "INSTRUCTOR_STAFF" });
      userId = res.body.data.user.id;
    });

    it("rejects a Program Administrator", async () => {
      const res = await request(app)
        .patch(`/api/users/${userId}`)
        .set("Authorization", `Bearer ${programAdminToken}`)
        .send({ name: "Renamed" });
      expect(res.status).toBe(403);
    });

    it("updates name/email/role", async () => {
      const res = await request(app)
        .patch(`/api/users/${userId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ name: "Renamed Person", role: "CAREER_SERVICES_STAFF" });
      expect(res.status).toBe(200);
      expect(res.body.data.user).toMatchObject({ name: "Renamed Person", role: "CAREER_SERVICES_STAFF" });
    });

    it("does not leak another institution's user", async () => {
      const res = await request(app)
        .patch(`/api/users/${userId}`)
        .set("Authorization", `Bearer ${otherAdminToken}`)
        .send({ name: "Hijacked" });
      expect(res.status).toBe(404);
    });

    it("rejects an email collision with another user", async () => {
      const res = await request(app)
        .patch(`/api/users/${userId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ email: "another-instructor@users-test.edu" });
      expect(res.status).toBe(409);
    });
  });

  describe("active toggle", () => {
    let userId: number;

    beforeAll(async () => {
      const res = await request(app)
        .post("/api/users/invite")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ name: "Deactivatable Person", email: "deactivatable@users-test.edu", role: "INSTRUCTOR_STAFF" });
      userId = res.body.data.user.id;
      await request(app)
        .post(`/api/public/set-password/${res.body.data.token}`)
        .send({ password: "password123" });
    });

    it("blocks login and refresh immediately once deactivated", async () => {
      const before = await request(app).post("/api/auth/login").send({ email: "deactivatable@users-test.edu", password: "password123" });
      expect(before.status).toBe(200);

      const deactivate = await request(app)
        .patch(`/api/users/${userId}/active`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ active: false });
      expect(deactivate.status).toBe(200);
      expect(deactivate.body.data.user.active).toBe(false);

      const afterLogin = await request(app).post("/api/auth/login").send({ email: "deactivatable@users-test.edu", password: "password123" });
      expect(afterLogin.status).toBe(401);

      const refreshCookie = before.headers["set-cookie"]!;
      const afterRefresh = await request(app).post("/api/auth/refresh").set("Cookie", refreshCookie);
      expect(afterRefresh.status).toBe(401);
    });

    it("reactivating restores login", async () => {
      await request(app)
        .patch(`/api/users/${userId}/active`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ active: true });
      const res = await request(app).post("/api/auth/login").send({ email: "deactivatable@users-test.edu", password: "password123" });
      expect(res.status).toBe(200);
    });
  });

  describe("reset password", () => {
    it("issues a fresh token that supersedes any prior one", async () => {
      const invite = await request(app)
        .post("/api/users/invite")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ name: "Resettable Person", email: "resettable@users-test.edu", role: "INSTRUCTOR_STAFF" });
      const userId = invite.body.data.user.id;
      const originalToken = invite.body.data.token;

      const reset = await request(app)
        .post(`/api/users/${userId}/reset-password`)
        .set("Authorization", `Bearer ${systemAdminToken}`);
      expect(reset.status).toBe(200);
      const newToken = reset.body.data.token;
      expect(newToken).not.toBe(originalToken);

      const oldTokenInfo = await request(app).get(`/api/public/set-password/${originalToken}`);
      expect(oldTokenInfo.status).toBe(404);
      const newTokenInfo = await request(app).get(`/api/public/set-password/${newToken}`);
      expect(newTokenInfo.status).toBe(200);
    });

    it("rejects a non-admin", async () => {
      const res = await request(app).post("/api/users/1/reset-password").set("Authorization", `Bearer ${programAdminToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe("access grants", () => {
    let userId: number;

    beforeAll(async () => {
      const res = await request(app)
        .post("/api/users/invite")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ name: "Scoped Program Admin", email: "scoped-pa@users-test.edu", role: "PROGRAM_ADMINISTRATOR" });
      userId = res.body.data.user.id;
    });

    it("rejects a Program Administrator from managing access grants", async () => {
      const res = await request(app)
        .put(`/api/users/${userId}/access`)
        .set("Authorization", `Bearer ${programAdminToken}`)
        .send({ programIds: [programId], campusIds: [] });
      expect(res.status).toBe(403);
    });

    it("rejects an unknown programId", async () => {
      const res = await request(app)
        .put(`/api/users/${userId}/access`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ programIds: [999999], campusIds: [] });
      expect(res.status).toBe(400);
    });

    it("grants and then replaces the full access set", async () => {
      const grant = await request(app)
        .put(`/api/users/${userId}/access`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ programIds: [programId], campusIds: [campusId] });
      expect(grant.status).toBe(200);
      expect(grant.body.data).toMatchObject({ programIds: [programId], campusIds: [campusId] });

      const listed = await request(app).get("/api/users?includeInactive=true").set("Authorization", `Bearer ${systemAdminToken}`);
      const row = listed.body.data.users.find((u: { id: number }) => u.id === userId);
      expect(row.programIds).toEqual([programId]);
      expect(row.campusIds).toEqual([campusId]);

      const replace = await request(app)
        .put(`/api/users/${userId}/access`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ programIds: [], campusIds: [] });
      expect(replace.status).toBe(200);
      expect(replace.body.data).toMatchObject({ programIds: [], campusIds: [] });

      const remainingGrants = await prisma.userProgramAccess.findMany({ where: { userId } });
      expect(remainingGrants).toHaveLength(0);
    });
  });
});
