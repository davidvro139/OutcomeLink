import request from "supertest";
import { createApp } from "../../app";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";

const app = createApp();

/**
 * Regression coverage for a bug found via manual browser verification of P10
 * (docs/TODO.md): search only ever compared the whole query string against a
 * single column, so a full "First Last" search matched nothing even though
 * both single-token searches worked fine.
 */
describe("student search — multi-token full-name matching (integration)", () => {
  let adminToken: string;
  let isobelId: number;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Student Search Test Institution" } });
    isobelId = await prisma.student
      .create({ data: { institutionId: institution.id, internalStudentId: "SEARCH-1", firstName: "Isobel", lastName: "Yost" } })
      .then((s) => s.id);
    await prisma.student.create({
      data: { institutionId: institution.id, internalStudentId: "SEARCH-2", firstName: "Marcus", lastName: "Webb" },
    });

    const passwordHash = await hashPassword("password123");
    await prisma.user.create({
      data: { institutionId: institution.id, name: "Admin", email: "admin@search-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    const login = await request(app).post("/api/auth/login").send({ email: "admin@search-test.edu", password: "password123" });
    adminToken = login.body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("matches on a single token, as before", async () => {
    const res = await request(app)
      .get("/api/students?search=Yost")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((s: { id: number }) => s.id)).toEqual([isobelId]);
  });

  it("matches a full 'First Last' query against the actual first+last name pair", async () => {
    const res = await request(app)
      .get("/api/students?search=Isobel Yost")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((s: { id: number }) => s.id);
    expect(ids).toEqual([isobelId]);
  });

  it("finds the same student via global search with a full-name query", async () => {
    const res = await request(app)
      .get("/api/search?q=Isobel Yost")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.students.map((s: { id: number }) => s.id);
    expect(ids).toEqual([isobelId]);
  });
});
