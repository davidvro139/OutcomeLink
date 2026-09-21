import request from "supertest";
import { createApp } from "../../app";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";

const app = createApp();

describe("users (integration)", () => {
  let institutionId: number;
  let otherInstitutionId: number;
  let systemAdminToken: string;
  let institutionalAdminToken: string;
  let programAdminToken: string;
  let otherAdminToken: string;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Users Test Institution" } });
    institutionId = institution.id;
    const otherInstitution = await prisma.institution.create({ data: { name: "Other Users Institution" } });
    otherInstitutionId = otherInstitution.id;

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

  it("rejects a Program Administrator from creating a user", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${programAdminToken}`)
      .send({ name: "New Person", email: "new-person@users-test.edu", password: "password123", role: "INSTRUCTOR_STAFF" });
    expect(res.status).toBe(403);
  });

  it("lets a System Administrator create a user scoped to their own institution", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${systemAdminToken}`)
      .send({ name: "New Instructor", email: "new-instructor@users-test.edu", password: "password123", role: "INSTRUCTOR_STAFF" });

    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ name: "New Instructor", email: "new-instructor@users-test.edu", role: "INSTRUCTOR_STAFF", active: true });
    expect(res.body.data.user.passwordHash).toBeUndefined();

    const stored = await prisma.user.findUnique({ where: { email: "new-instructor@users-test.edu" } });
    expect(stored).toMatchObject({ institutionId });

    // The new user can actually log in with the password an admin set.
    const loginRes = await request(app).post("/api/auth/login").send({ email: "new-instructor@users-test.edu", password: "password123" });
    expect(loginRes.status).toBe(200);
  });

  it("lets an Institutional Administrator create a user too", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${institutionalAdminToken}`)
      .send({ name: "Another Instructor", email: "another-instructor@users-test.edu", password: "password123", role: "CAREER_SERVICES_STAFF" });
    expect(res.status).toBe(201);
  });

  it("ignores any caller-supplied institutionId — a created user always lands in the caller's own institution", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${systemAdminToken}`)
      .send({
        name: "Spoof Attempt",
        email: "spoof-attempt@users-test.edu",
        password: "password123",
        role: "INSTRUCTOR_STAFF",
        institutionId: otherInstitutionId,
      });
    expect(res.status).toBe(201);

    const stored = await prisma.user.findUnique({ where: { email: "spoof-attempt@users-test.edu" } });
    expect(stored).toMatchObject({ institutionId });
  });

  it("rejects creating a user with an already-used email", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${systemAdminToken}`)
      .send({ name: "Duplicate", email: "new-instructor@users-test.edu", password: "password123", role: "INSTRUCTOR_STAFF" });
    expect(res.status).toBe(409);
  });

  it("rejects creating a user with a short password", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${systemAdminToken}`)
      .send({ name: "Short Password", email: "short-password@users-test.edu", password: "short", role: "INSTRUCTOR_STAFF" });
    expect(res.status).toBe(400);
  });

  it("keeps the created users scoped to their own institution in the staff directory", async () => {
    const res = await request(app).get("/api/users").set("Authorization", `Bearer ${systemAdminToken}`);
    expect(res.body.data.users.map((u: { name: string }) => u.name)).toEqual(
      expect.arrayContaining(["New Instructor", "Another Instructor", "Spoof Attempt"]),
    );

    const otherRes = await request(app).get("/api/users").set("Authorization", `Bearer ${otherAdminToken}`);
    expect(otherRes.body.data.users.map((u: { name: string }) => u.name)).not.toEqual(
      expect.arrayContaining(["New Instructor"]),
    );
  });
});
