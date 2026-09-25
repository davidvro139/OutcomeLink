import request from "supertest";
import { createApp } from "../app";
import { hashPassword } from "../lib/password";
import { prisma } from "../lib/prisma";
import { resetRateLimits, setRateLimitingForTests } from "./rateLimit";

const app = createApp();

describe("rate limiting and security headers (integration)", () => {
  beforeAll(async () => {
    const institution = await prisma.institution.create({
      data: { name: "Rate Limit Test Institution" },
    });
    const passwordHash = await hashPassword("password123");
    for (const email of ["one@rate-limit-test.edu", "two@rate-limit-test.edu"]) {
      await prisma.user.create({
        data: {
          institutionId: institution.id,
          name: email,
          email,
          passwordHash,
          role: "INSTITUTIONAL_ADMINISTRATOR",
        },
      });
    }
  });

  beforeEach(() => {
    resetRateLimits();
    setRateLimitingForTests(true);
  });

  afterEach(() => setRateLimitingForTests(false));

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const login = (email: string, password: string) =>
    request(app).post("/api/auth/login").send({ email, password });

  it("locks an account's sign-in after 10 failed attempts from one address, with a clear message", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await login("one@rate-limit-test.edu", "wrong-password")).status).toBe(401);
    }
    const blocked = await login("one@rate-limit-test.edu", "wrong-password");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    expect(blocked.body.error.message).toMatch(
      /Too many failed sign-in attempts for this account\. Try again in \d+ minutes?\./,
    );
    expect(blocked.headers["ratelimit"] ?? blocked.headers["ratelimit-policy"]).toBeDefined();

    // Even the right password is refused while locked out...
    expect((await login("one@rate-limit-test.edu", "password123")).status).toBe(429);
    // ...but a different account from the same address is not locked by that.
    expect((await login("two@rate-limit-test.edu", "password123")).status).toBe(200);
  });

  it("does not count successful sign-ins", async () => {
    for (let i = 0; i < 15; i++) {
      expect((await login("two@rate-limit-test.edu", "password123")).status).toBe(200);
    }
  });

  it("caps failed sign-ins from one address across many accounts", async () => {
    for (let i = 0; i < 50; i++) {
      expect((await login(`nobody${i}@rate-limit-test.edu`, "wrong-password")).status).toBe(401);
    }
    const blocked = await login("nobody-else@rate-limit-test.edu", "wrong-password");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.message).toContain("Too many failed sign-in attempts.");
  });

  it("limits registration attempts", async () => {
    let last = 0;
    for (let i = 0; i < 6; i++) {
      last = (await request(app).post("/api/auth/register").send({})).status; // 400 validation errors still count
    }
    expect(last).toBe(429);
  });

  it("limits requests to token-bearing public routes", async () => {
    for (let i = 0; i < 60; i++) {
      expect((await request(app).get("/api/public/surveys/graduate/not-a-real-token")).status).toBe(
        404,
      );
    }
    expect((await request(app).get("/api/public/surveys/graduate/not-a-real-token")).status).toBe(
      429,
    );
    expect((await request(app).get("/api/public/set-password/not-a-real-token")).status).not.toBe(
      429,
    ); // its own counter
  });

  it("is off by default in tests, so the other suites are unaffected", async () => {
    setRateLimitingForTests(false);
    for (let i = 0; i < 12; i++) {
      expect((await login("one@rate-limit-test.edu", "wrong-password")).status).toBe(401);
    }
  });

  it("sets standard security headers", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });
});
