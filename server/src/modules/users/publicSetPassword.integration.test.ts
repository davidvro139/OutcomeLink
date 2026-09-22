import request from "supertest";
import { createApp } from "../../app";
import { prisma } from "../../lib/prisma";

const app = createApp();

describe("public set-password (integration)", () => {
  let adminToken: string;

  beforeAll(async () => {
    const bootstrap = await request(app)
      .post("/api/auth/register")
      .send({ institutionName: "Set Password Bootstrap", name: "Boot Admin", email: "bootadmin@setpw-test.edu", password: "password123" });
    adminToken = bootstrap.body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("404s for an unknown token", async () => {
    const res = await request(app).get("/api/public/set-password/not-a-real-token");
    expect(res.status).toBe(404);
  });

  it("404s for an expired token", async () => {
    const invited = await request(app)
      .post("/api/users/invite")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Expired Invitee", email: "expired@setpw-test.edu", role: "INSTRUCTOR_STAFF" });
    const token = invited.body.data.token;
    await prisma.user.update({
      where: { id: invited.body.data.user.id },
      data: { passwordSetTokenExpiresAt: new Date(Date.now() - 1000) },
    });

    const info = await request(app).get(`/api/public/set-password/${token}`);
    expect(info.status).toBe(404);
    const complete = await request(app).post(`/api/public/set-password/${token}`).send({ password: "newpassword123" });
    expect(complete.status).toBe(404);
  });

  it("completes an invite end to end: info -> set password -> login, and the token cannot be reused", async () => {
    const invited = await request(app)
      .post("/api/users/invite")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Real Invitee", email: "real-invitee@setpw-test.edu", role: "CAREER_SERVICES_STAFF" });
    const token = invited.body.data.token;

    const info = await request(app).get(`/api/public/set-password/${token}`);
    expect(info.status).toBe(200);
    expect(info.body.data).toMatchObject({ name: "Real Invitee", email: "real-invitee@setpw-test.edu" });

    const rejectShort = await request(app).post(`/api/public/set-password/${token}`).send({ password: "short" });
    expect(rejectShort.status).toBe(400);

    const complete = await request(app).post(`/api/public/set-password/${token}`).send({ password: "mynewpassword123" });
    expect(complete.status).toBe(200);
    expect(complete.body.data.email).toBe("real-invitee@setpw-test.edu");

    const login = await request(app).post("/api/auth/login").send({ email: "real-invitee@setpw-test.edu", password: "mynewpassword123" });
    expect(login.status).toBe(200);

    // The same token is now consumed — using it again fails.
    const reused = await request(app).get(`/api/public/set-password/${token}`);
    expect(reused.status).toBe(404);
  });

  it("an admin-initiated reset link completes the same way", async () => {
    const invited = await request(app)
      .post("/api/users/invite")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Reset Flow Person", email: "reset-flow@setpw-test.edu", role: "INSTRUCTOR_STAFF" });
    await request(app).post(`/api/public/set-password/${invited.body.data.token}`).send({ password: "firstpassword1" });

    const reset = await request(app)
      .post(`/api/users/${invited.body.data.user.id}/reset-password`)
      .set("Authorization", `Bearer ${adminToken}`);
    const resetToken = reset.body.data.token;

    const complete = await request(app).post(`/api/public/set-password/${resetToken}`).send({ password: "secondpassword2" });
    expect(complete.status).toBe(200);

    const oldPasswordLogin = await request(app).post("/api/auth/login").send({ email: "reset-flow@setpw-test.edu", password: "firstpassword1" });
    expect(oldPasswordLogin.status).toBe(401);
    const newPasswordLogin = await request(app).post("/api/auth/login").send({ email: "reset-flow@setpw-test.edu", password: "secondpassword2" });
    expect(newPasswordLogin.status).toBe(200);
  });
});
