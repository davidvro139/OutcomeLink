import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { prisma } from "../../lib/prisma";
import { testWithAuth } from "../../test/testHelpers";

describe("Equity API Integration", () => {
  let app: ReturnType<typeof createApp>;
  let institutionId: number;
  let programId: number;
  let userId: string;
  let token: string;

  beforeEach(async () => {
    app = createApp();

    // Create test data
    const institution = await prisma.institution.create({
      data: { name: "Test Institution" },
    });
    institutionId = institution.id;

    const program = await prisma.program.create({
      data: {
        institutionId,
        name: "Test Program",
        code: "TEST",
        credentialType: "Certificate",
      },
    });
    programId = program.id;

    const campus = await prisma.campus.create({
      data: { institutionId, name: "Main", code: "M" },
    });

    const user = await prisma.user.create({
      data: {
        institutionId,
        name: "Test User",
        email: "test@example.com",
        passwordHash: "hash",
        role: "INSTITUTIONAL_ADMINISTRATOR",
      },
    });
    userId = user.id;

    // Mock auth for testing (normally done via JWT)
    token = `mock-token-${userId}`;
  });

  describe("GET /api/equity/breakdown", () => {
    it("should return breakdown for valid parameters", async () => {
      const response = await request(app)
        .get("/api/equity/breakdown")
        .query({
          metric: "COMPLETION",
          dimension: "entryYear",
        })
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("metric", "COMPLETION");
      expect(response.body).toHaveProperty("dimension", "entryYear");
      expect(response.body).toHaveProperty("groups");
      expect(Array.isArray(response.body.groups)).toBe(true);
    });

    it("should require authentication", async () => {
      const response = await request(app)
        .get("/api/equity/breakdown")
        .query({
          metric: "COMPLETION",
          dimension: "entryYear",
        });

      expect(response.status).toBe(401);
    });

    it("should validate metric parameter", async () => {
      const response = await request(app)
        .get("/api/equity/breakdown")
        .query({
          metric: "INVALID",
          dimension: "entryYear",
        })
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(400);
    });

    it("should validate dimension parameter", async () => {
      const response = await request(app)
        .get("/api/equity/breakdown")
        .query({
          metric: "COMPLETION",
          dimension: "INVALID",
        })
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(400);
    });

    it("should support all metrics", async () => {
      for (const metric of ["COMPLETION", "PLACEMENT", "LICENSURE"]) {
        const response = await request(app)
          .get("/api/equity/breakdown")
          .query({
            metric,
            dimension: "entryYear",
          })
          .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.metric).toBe(metric);
      }
    });

    it("should support all dimensions", async () => {
      const dimensions = [
        "entryYear",
        "gender",
        "raceEthnicity",
        "economicallyDisadvantaged",
        "firstGenerationStudent",
        "disabilityStatus",
      ];

      for (const dimension of dimensions) {
        const response = await request(app)
          .get("/api/equity/breakdown")
          .query({
            metric: "COMPLETION",
            dimension,
          })
          .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.dimension).toBe(dimension);
      }
    });
  });

  describe("Demographics CRUD", () => {
    let studentId: number;

    beforeEach(async () => {
      const student = await prisma.student.create({
        data: {
          institutionId,
          internalStudentId: "TEST-001",
          firstName: "Test",
          lastName: "Student",
        },
      });
      studentId = student.id;
    });

    it("should get student demographics", async () => {
      // Create demographics first
      await prisma.studentDemographics.create({
        data: {
          studentId,
          gender: "MALE",
          raceEthnicity: "WHITE",
        },
      });

      const response = await request(app)
        .get(`/api/students/${studentId}/demographics`)
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.demographics).toHaveProperty("gender", "MALE");
    });

    it("should return null demographics if not set", async () => {
      const response = await request(app)
        .get(`/api/students/${studentId}/demographics`)
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.demographics).toBeNull();
    });

    it("should upsert student demographics", async () => {
      const response = await request(app)
        .put(`/api/students/${studentId}/demographics`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          gender: "FEMALE",
          raceEthnicity: "ASIAN",
          economicallyDisadvantaged: true,
        });

      expect(response.status).toBe(200);
      expect(response.body.demographics).toHaveProperty("gender", "FEMALE");
      expect(response.body.demographics).toHaveProperty(
        "raceEthnicity",
        "ASIAN"
      );
      expect(response.body.demographics).toHaveProperty(
        "economicallyDisadvantaged",
        true
      );
    });

    it("should validate demographics enum values", async () => {
      const response = await request(app)
        .put(`/api/students/${studentId}/demographics`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          gender: "INVALID_GENDER",
        });

      expect(response.status).toBe(400);
    });

    it("should allow null demographics fields", async () => {
      const response = await request(app)
        .put(`/api/students/${studentId}/demographics`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          gender: null,
          raceEthnicity: null,
          economicallyDisadvantaged: null,
        });

      expect(response.status).toBe(200);
    });

    it("should require STUDENT_MANAGER role for PUT", async () => {
      const readOnlyUser = await prisma.user.create({
        data: {
          institutionId,
          name: "Read Only",
          email: "readonly@example.com",
          passwordHash: "hash",
          role: "READ_ONLY_AUDITOR",
        },
      });

      const response = await request(app)
        .put(`/api/students/${studentId}/demographics`)
        .set("Authorization", `Bearer mock-token-${readOnlyUser.id}`)
        .send({
          gender: "MALE",
        });

      expect(response.status).toBe(403);
    });
  });
});
