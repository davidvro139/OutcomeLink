import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { prisma } from "../../lib/prisma";

describe("Equity API Integration", () => {
  let app: ReturnType<typeof createApp>;
  let institutionId: number;
  let programId: number;
  let campusId: number;

  beforeEach(async () => {
    app = createApp();

    // Create test data
    const institution = await prisma.institution.create({
      data: { name: "Test Institution" },
    });
    institutionId = institution.id;

    const campus = await prisma.campus.create({
      data: { institutionId, name: "Main" },
    });
    campusId = campus.id;

    const program = await prisma.program.create({
      data: {
        institutionId,
        campusId,
        name: "Test Program",
        code: "TEST",
        credentialType: "Certificate",
      },
    });
    programId = program.id;

    // Create test user
    await prisma.user.create({
      data: {
        institutionId,
        name: "Test User",
        email: "test@example.com",
        passwordHash: "hash",
        role: "INSTITUTIONAL_ADMINISTRATOR",
      },
    });
  });

  describe("Demographics database operations", () => {
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

    afterEach(async () => {
      await prisma.studentDemographics.deleteMany({ where: { studentId } });
      await prisma.student.deleteMany({ where: { id: studentId } });
    });

    it("should create student demographics", async () => {
      const demographics = await prisma.studentDemographics.create({
        data: {
          studentId,
          gender: "MALE",
          raceEthnicity: "WHITE",
        },
      });

      expect(demographics.gender).toBe("MALE");
      expect(demographics.raceEthnicity).toBe("WHITE");
    });

    it("should retrieve student demographics", async () => {
      await prisma.studentDemographics.create({
        data: {
          studentId,
          gender: "FEMALE",
          raceEthnicity: "ASIAN",
        },
      });

      const demographics = await prisma.studentDemographics.findUnique({
        where: { studentId },
      });

      expect(demographics).toBeDefined();
      expect(demographics?.gender).toBe("FEMALE");
    });

    it("should update student demographics", async () => {
      await prisma.studentDemographics.create({
        data: { studentId, gender: "MALE" },
      });

      const updated = await prisma.studentDemographics.update({
        where: { studentId },
        data: { gender: "FEMALE" },
      });

      expect(updated.gender).toBe("FEMALE");
    });

    it("should upsert demographics (create or update)", async () => {
      // First upsert creates
      let demographics = await prisma.studentDemographics.upsert({
        where: { studentId },
        create: { studentId, gender: "MALE" },
        update: { gender: "FEMALE" },
      });
      expect(demographics.gender).toBe("MALE");

      // Second upsert updates
      demographics = await prisma.studentDemographics.upsert({
        where: { studentId },
        create: { studentId, gender: "MALE" },
        update: { gender: "NONBINARY" },
      });
      expect(demographics.gender).toBe("NONBINARY");
    });

    it("should handle null demographic fields", async () => {
      const demographics = await prisma.studentDemographics.create({
        data: {
          studentId,
          gender: null,
          raceEthnicity: null,
          economicallyDisadvantaged: null,
        },
      });

      expect(demographics.gender).toBeNull();
      expect(demographics.raceEthnicity).toBeNull();
    });
  });
});
