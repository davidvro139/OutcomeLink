import request from "supertest";
import { createApp } from "../../app";
import { prisma } from "../../lib/prisma";

const app = createApp();

describe("auth (integration)", () => {
  let institutionId: number;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Test Institution" } });
    institutionId = institution.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const credentials = { email: "test-user@example.edu", password: "password123" };

  it("registers a new user by creating a brand-new institution, always as SYSTEM_ADMINISTRATOR", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ institutionName: "Brand New College", name: "Test User", ...credentials });

    expect(res.status).toBe(201);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({ email: credentials.email, role: "SYSTEM_ADMINISTRATOR" });
    expect(res.body.data.user.institutionId).not.toBe(institutionId);
    // The refresh token should be set as an httpOnly cookie, not exposed in the body.
    expect(res.headers["set-cookie"]?.[0]).toMatch(/refreshToken=.*HttpOnly/i);

    const createdInstitution = await prisma.institution.findUnique({
      where: { id: res.body.data.user.institutionId },
    });
    expect(createdInstitution).toMatchObject({ name: "Brand New College" });
  });

  it("ignores a caller-supplied institutionId or role — registration can never join an existing institution or pick a role", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        institutionName: "Second Brand New College",
        institutionId, // an existing, real institution — must be ignored
        role: "READ_ONLY_AUDITOR", // a role other than the always-forced one — must be ignored
        name: "Attacker",
        email: "attacker@example.edu",
        password: "password123",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.user.institutionId).not.toBe(institutionId);
    expect(res.body.data.user.role).toBe("SYSTEM_ADMINISTRATOR");
  });

  it("rejects registration with an already-used email", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ institutionName: "Duplicate Attempt College", name: "Duplicate", ...credentials });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("rejects registration with a short password", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ institutionName: "Short Password College", name: "X", email: "short@example.edu", password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects registration with no institution name", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "No Institution", email: "noinstitution@example.edu", password: "password123" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("logs in with correct credentials", async () => {
    const res = await request(app).post("/api/auth/login").send(credentials);
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
  });

  it("rejects login with the wrong password", async () => {
    const res = await request(app).post("/api/auth/login").send({ ...credentials, password: "wrongpassword" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects /me without a bearer token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns the current user profile with a valid bearer token", async () => {
    const loginRes = await request(app).post("/api/auth/login").send(credentials);
    const accessToken = loginRes.body.data.accessToken;

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ email: credentials.email });
  });

  it("rejects a request with a malformed bearer token", async () => {
    const res = await request(app).get("/api/auth/me").set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });

  it("refreshes an access token using the refresh cookie", async () => {
    const loginRes = await request(app).post("/api/auth/login").send(credentials);
    const cookie = loginRes.headers["set-cookie"]!;

    const res = await request(app).post("/api/auth/refresh").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
  });

  it("rejects refresh with no cookie at all", async () => {
    const res = await request(app).post("/api/auth/refresh");
    expect(res.status).toBe(401);
  });
});
