import request from "supertest";
import { createApp } from "../../app";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";

const app = createApp();

describe("programs (integration)", () => {
  let institutionId: number;
  let campusId: number;
  let adminToken: string;
  let instructorToken: string;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Programs Test Institution" } });
    institutionId = institution.id;

    const campus = await prisma.campus.create({ data: { institutionId, name: "Main Campus" } });
    campusId = campus.id;

    const passwordHash = await hashPassword("password123");
    await prisma.user.create({
      data: { institutionId, name: "Admin", email: "admin@programs-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    await prisma.user.create({
      data: { institutionId, name: "Instructor", email: "instructor@programs-test.edu", passwordHash, role: "INSTRUCTOR_STAFF" },
    });

    const adminLogin = await request(app).post("/api/auth/login").send({ email: "admin@programs-test.edu", password: "password123" });
    adminToken = adminLogin.body.data.accessToken;

    const instructorLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "instructor@programs-test.edu", password: "password123" });
    instructorToken = instructorLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects program creation without authentication", async () => {
    const res = await request(app).post("/api/programs").send({ campusId, name: "X", code: "X", credentialType: "Diploma" });
    expect(res.status).toBe(401);
  });

  it("rejects program creation from a non-admin role", async () => {
    const res = await request(app)
      .post("/api/programs")
      .set("Authorization", `Bearer ${instructorToken}`)
      .send({ campusId, name: "Welding", code: "WLD-100", credentialType: "Certificate" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  let programId: number;

  it("allows a System Administrator to create a program", async () => {
    const res = await request(app)
      .post("/api/programs")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ campusId, name: "Welding Technology", code: "WLD-100", credentialType: "Certificate" });

    expect(res.status).toBe(201);
    expect(res.body.data.program).toMatchObject({ name: "Welding Technology", code: "WLD-100" });
    programId = res.body.data.program.id;
  });

  it("rejects creating a program with a missing required field", async () => {
    const res = await request(app)
      .post("/api/programs")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ campusId, name: "Missing Code" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("lists programs for the institution, visible to any authenticated role", async () => {
    const res = await request(app).get("/api/programs").set("Authorization", `Bearer ${instructorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: { id: number }) => p.id)).toContain(programId);
    expect(res.body.meta.pagination.totalItems).toBeGreaterThanOrEqual(1);
  });

  it("filters the program list by campusId", async () => {
    const otherCampus = await prisma.campus.create({ data: { institutionId, name: "North Campus" } });
    const res = await request(app)
      .get(`/api/programs?campusId=${otherCampus.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it("gets a single program by id", async () => {
    const res = await request(app).get(`/api/programs/${programId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.program.id).toBe(programId);
  });

  it("returns 404 for a program that doesn't exist", async () => {
    const res = await request(app).get("/api/programs/999999").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it("does not return a program belonging to a different institution", async () => {
    const otherInstitution = await prisma.institution.create({ data: { name: "Other Institution" } });
    const otherCampus = await prisma.campus.create({ data: { institutionId: otherInstitution.id, name: "Campus" } });
    const otherProgram = await prisma.program.create({
      data: { institutionId: otherInstitution.id, campusId: otherCampus.id, name: "Other Program", code: "OTH-1", credentialType: "Diploma" },
    });

    const res = await request(app).get(`/api/programs/${otherProgram.id}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});
