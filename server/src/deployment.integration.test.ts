import { spawnSync } from "node:child_process";
import path from "node:path";
import request from "supertest";
import { createApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";

const app = createApp();

/** What a live deployment relies on: health/readiness endpoints, registration switched off, and a way to create the first administrator. */
describe("deployment support (integration)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("reports liveness and, with the database reachable, readiness", async () => {
    expect((await request(app).get("/health")).body.data.status).toBe("ok");
    const ready = await request(app).get("/health/ready");
    expect(ready.status).toBe(200);
    expect(ready.body.data.status).toBe("ready");
  });

  it("refuses self-service registration when it is turned off, and allows it otherwise", async () => {
    const body = { institutionName: "Closed College", name: "Nobody", email: "nobody@closed.example", password: "password123" };
    const original = env.ALLOW_REGISTRATION;
    try {
      env.ALLOW_REGISTRATION = false;
      const refused = await request(app).post("/api/auth/register").send(body);
      expect(refused.status).toBe(403);
      expect(refused.body.error.code).toBe("REGISTRATION_DISABLED");
      expect(await prisma.user.count({ where: { email: body.email } })).toBe(0);

      env.ALLOW_REGISTRATION = true;
      expect((await request(app).post("/api/auth/register").send(body)).status).toBe(201);
    } finally {
      env.ALLOW_REGISTRATION = original;
    }
  });

  describe("bootstrap script", () => {
    const script = path.resolve(__dirname, "scripts", "bootstrapAdmin.ts");
    const run = (args: string[]) =>
      spawnSync(process.execPath, [require.resolve("tsx/cli"), script, ...args], {
        env: process.env,
        encoding: "utf8",
        cwd: path.resolve(__dirname, ".."),
      });

    it("creates an institution with a System Administrator who can sign in, and refuses a duplicate email", async () => {
      const args = ["--institution", "Bootstrap College", "--name", "Boot Admin", "--email", "boot.admin@bootstrap.example", "--password", "a-long-password"];
      const first = run(args);
      expect(first.status).toBe(0);
      expect(first.stdout).toContain("Created institution");

      const login = await request(app)
        .post("/api/auth/login")
        .send({ email: "boot.admin@bootstrap.example", password: "a-long-password" });
      expect(login.status).toBe(200);
      expect(login.body.data.user.role).toBe("SYSTEM_ADMINISTRATOR");

      const again = run(args);
      expect(again.status).toBe(1);
      expect(again.stderr).toContain("already exists");
    }, 60_000);

    it("rejects missing arguments and a short password", () => {
      expect(run(["--institution", "X"]).status).toBe(2);
      const short = run(["--institution", "X", "--name", "Y", "--email", "y@x.example", "--password", "short"]);
      expect(short.status).toBe(2);
      expect(short.stderr).toContain("at least 8 characters");
    }, 60_000);
  });
});
