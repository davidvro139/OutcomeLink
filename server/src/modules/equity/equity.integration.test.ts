import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { prisma } from "../../lib/prisma";
import { hashPassword } from "../../lib/password";

describe("Equity API Integration", () => {
  let app: ReturnType<typeof createApp>;
  let institutionId: number;
  let programId: number;
  let campusId: number;
  let reportingPeriodId: number;
  let ruleSetId: number;
  let token: string;

  beforeAll(async () => {
    app = createApp();

    // Create institution and campus
    const institution = await prisma.institution.create({
      data: { name: "Test Institution" },
    });
    institutionId = institution.id;

    const campus = await prisma.campus.create({
      data: { institutionId, name: "Main" },
    });
    campusId = campus.id;

    // Create program
    const program = await prisma.program.create({
      data: {
        institutionId,
        campusId,
        name: "Test Program",
        code: "TEST",
        credentialType: "Certificate",
        licensureRequired: false,
      },
    });
    programId = program.id;

    // Create test user and get token
    const passwordHash = await hashPassword("password123");
    const uniqueEmail = `test-equity-${Date.now()}@example.com`;
    await prisma.user.create({
      data: {
        institutionId,
        name: "Test User",
        email: uniqueEmail,
        passwordHash,
        role: "INSTITUTIONAL_ADMINISTRATOR",
      },
    });
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: uniqueEmail, password: "password123" });
    token = loginRes.body.data.accessToken;

    // Create accreditation framework and reporting period
    const framework = await prisma.accreditationFramework.create({
      data: { name: `TEST-EQUITY-FRAMEWORK-${Date.now()}` },
    });
    const ruleSet = await prisma.ruleSet.create({
      data: {
        frameworkId: framework.id,
        versionLabel: "TEST-2026",
        effectiveStartDate: new Date("2025-01-01"),
        ruleDefinition: { benchmarks: { completion: 70, placement: 75, licensure: 80 } },
      },
    });
    ruleSetId = ruleSet.id;

    const period = await prisma.reportingPeriod.create({
      data: {
        institutionId,
        ruleSetId,
        label: "2025-2026",
        startDate: new Date("2025-07-01"),
        endDate: new Date("2026-06-30"),
      },
    });
    reportingPeriodId = period.id;
  });

  describe("Demographics CRUD", () => {
    let studentId: number;

    beforeEach(async () => {
      const student = await prisma.student.create({
        data: {
          institutionId,
          internalStudentId: `TEST-001-${Date.now()}`,
          firstName: "Test",
          lastName: "Student",
        },
      });
      studentId = student.id;
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

    it("should handle tri-state boolean fields (true/false/null)", async () => {
      const demographics = await prisma.studentDemographics.create({
        data: {
          studentId,
          economicallyDisadvantaged: true,
          firstGenerationStudent: false,
          disabilityStatus: null,
        },
      });

      expect(demographics.economicallyDisadvantaged).toBe(true);
      expect(demographics.firstGenerationStudent).toBe(false);
      expect(demographics.disabilityStatus).toBeNull();
    });

    it("PUT /api/students/:studentId/demographics should upsert via API", async () => {
      const res = await request(app)
        .put(`/api/students/${studentId}/demographics`)
        .set("Authorization", `Bearer ${token}`)
        .send({ gender: "FEMALE", raceEthnicity: "BLACK_AFRICAN_AMERICAN" });

      expect(res.status).toBe(200);
      expect(res.body.data.gender).toBe("FEMALE");
      expect(res.body.data.raceEthnicity).toBe("BLACK_AFRICAN_AMERICAN");

      // Verify it's actually in the database
      const demo = await prisma.studentDemographics.findUnique({ where: { studentId } });
      expect(demo?.gender).toBe("FEMALE");
    });

    it("GET /api/students/:studentId/demographics should retrieve demographics", async () => {
      await prisma.studentDemographics.create({
        data: {
          studentId,
          gender: "NONBINARY",
          economicallyDisadvantaged: true,
        },
      });

      const res = await request(app)
        .get(`/api/students/${studentId}/demographics`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.gender).toBe("NONBINARY");
      expect(res.body.data.economicallyDisadvantaged).toBe(true);
    });
  });

  describe("GET /api/equity/breakdown", () => {
    let student1Id: number;
    let student2Id: number;
    let student3Id: number;

    beforeEach(async () => {
      // Create 3 students with different demographics and enrollments
      const ts = Date.now();
      const s1 = await prisma.student.create({
        data: { institutionId, internalStudentId: `S1-${ts}`, firstName: "Alice", lastName: "One" },
      });
      student1Id = s1.id;

      const s2 = await prisma.student.create({
        data: { institutionId, internalStudentId: `S2-${ts}`, firstName: "Bob", lastName: "Two" },
      });
      student2Id = s2.id;

      const s3 = await prisma.student.create({
        data: { institutionId, internalStudentId: `S3-${ts}`, firstName: "Carol", lastName: "Three" },
      });
      student3Id = s3.id;

      // Create enrollments starting in different years
      const e1 = await prisma.studentEnrollment.create({
        data: {
          studentId: student1Id,
          programId,
          campusId,
          enrollmentStatus: "ACTIVE",
          startDate: new Date("2023-07-01"), // 2023 cohort
        },
      });

      const e2 = await prisma.studentEnrollment.create({
        data: {
          studentId: student2Id,
          programId,
          campusId,
          enrollmentStatus: "ACTIVE",
          startDate: new Date("2024-07-01"), // 2024 cohort
        },
      });

      const e3 = await prisma.studentEnrollment.create({
        data: {
          studentId: student3Id,
          programId,
          campusId,
          enrollmentStatus: "ACTIVE",
          startDate: new Date("2024-07-01"), // 2024 cohort
        },
      });

      // Create student classifications (needed for equity breakdown)
      await Promise.all([
        prisma.studentClassification.create({
          data: {
            studentEnrollmentId: e1.id,
            reportingPeriodId,
            metric: "COMPLETION",
            classificationCode: "TEST",
            determinedByRuleSetId: ruleSetId,
            explanation: { create: { countsInNumerator: true, countsInDenominator: true, reasonText: "Test" } },
          },
          include: { explanation: true },
        }),
        prisma.studentClassification.create({
          data: {
            studentEnrollmentId: e2.id,
            reportingPeriodId,
            metric: "COMPLETION",
            classificationCode: "TEST",
            determinedByRuleSetId: ruleSetId,
            explanation: { create: { countsInNumerator: true, countsInDenominator: true, reasonText: "Test" } },
          },
          include: { explanation: true },
        }),
        prisma.studentClassification.create({
          data: {
            studentEnrollmentId: e3.id,
            reportingPeriodId,
            metric: "COMPLETION",
            classificationCode: "TEST",
            determinedByRuleSetId: ruleSetId,
            explanation: { create: { countsInNumerator: false, countsInDenominator: true, reasonText: "Test" } },
          },
          include: { explanation: true },
        }),
      ]);

      // Create demographics for students
      await prisma.studentDemographics.create({
        data: { studentId: student1Id, gender: "FEMALE", raceEthnicity: "WHITE" },
      });
      await prisma.studentDemographics.create({
        data: { studentId: student2Id, gender: "MALE", raceEthnicity: "ASIAN" },
      });
      // Student 3 has no demographics (tests "Not on file")
    });

    it("should return equity breakdown by entry year", async () => {
      const res = await request(app)
        .get("/api/equity/breakdown")
        .query({ metric: "COMPLETION", dimension: "entryYear", programId })
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.metric).toBe("COMPLETION");
      expect(data.dimension).toBe("entryYear");
      expect(Array.isArray(data.groups)).toBe(true);

      // Should have 2 cohorts: 2023 and 2024
      const years = data.groups.map((g: any) => g.value).sort();
      expect(years).toContain("2023");
      expect(years).toContain("2024");

      // 2023: 1 student, 1 completion (100%)
      const y2023 = data.groups.find((g: any) => g.value === "2023");
      expect(y2023.denominator).toBe(1);
      expect(y2023.numerator).toBe(1);
      expect(y2023.percentage).toBe(100);
      expect(y2023.suppressed).toBe(false);

      // 2024: 2 students, 1 completion (50%)
      const y2024 = data.groups.find((g: any) => g.value === "2024");
      expect(y2024.denominator).toBe(2);
      expect(y2024.numerator).toBe(1);
      expect(y2024.percentage).toBe(50);
      expect(y2024.suppressed).toBe(false);
    });

    it("should return equity breakdown by gender dimension", async () => {
      const res = await request(app)
        .get("/api/equity/breakdown")
        .query({ metric: "COMPLETION", dimension: "gender", programId })
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.dimension).toBe("gender");
      expect(Array.isArray(data.groups)).toBe(true);

      // Should have FEMALE, MALE, and NOT_ON_FILE groups
      const values = data.groups.map((g: any) => g.value);
      expect(values).toContain("FEMALE");
      expect(values).toContain("MALE");
      expect(values).toContain("NOT_ON_FILE");

      // FEMALE: 1 student (s1), 1 completion (100%)
      const female = data.groups.find((g: any) => g.value === "FEMALE");
      expect(female.denominator).toBe(1);
      expect(female.numerator).toBe(1);

      // NOT_ON_FILE should have student 3 (1 student, 0 completions)
      const notOnFile = data.groups.find((g: any) => g.value === "NOT_ON_FILE");
      expect(notOnFile.denominator).toBe(1);
      expect(notOnFile.numerator).toBe(0);

      // Should have coverage data for demographic dimension
      expect(data.coverage).toBeDefined();
      expect(data.coverage.totalDenominator).toBe(3);
      expect(data.coverage.withDataOnFile).toBe(2);
    });

    it("should suppress groups with denominator < 10", async () => {
      // Create 8 more small groups to bring students close to 10
      for (let i = 0; i < 8; i++) {
        const s = await prisma.student.create({
          data: {
            institutionId,
            internalStudentId: `SUPPRESS-${i}-${Date.now()}`,
            firstName: `Student${i}`,
            lastName: `Suppress`,
          },
        });
        const e = await prisma.studentEnrollment.create({
          data: {
            studentId: s.id,
            programId,
            campusId,
            enrollmentStatus: "ACTIVE",
            startDate: new Date("2024-07-01"),
          },
        });
        await prisma.studentClassification.create({
          data: {
            studentEnrollmentId: e.id,
            reportingPeriodId,
            metric: "COMPLETION",
            classificationCode: "TEST",
            determinedByRuleSetId: ruleSetId,
            explanation: { create: { countsInNumerator: i % 2 === 0, countsInDenominator: true, reasonText: "Test" } },
          },
          include: { explanation: true },
        });
        await prisma.studentDemographics.create({
          data: { studentId: s.id, gender: "FEMALE" },
        });
      }

      const res = await request(app)
        .get("/api/equity/breakdown")
        .query({ metric: "COMPLETION", dimension: "gender", programId })
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      const data = res.body.data;

      // FEMALE group should now have 9 students (suppressed, denominator < 10)
      const female = data.groups.find((g: any) => g.value === "FEMALE");
      expect(female.denominator).toBe(9);
      expect(female.suppressed).toBe(true);
      expect(female.numerator).toBeNull();
      expect(female.percentage).toBeNull();
      expect(female.status).toBe("SUPPRESSED");
    });

    it("should include benchmark when single program selected", async () => {
      const res = await request(app)
        .get("/api/equity/breakdown")
        .query({ metric: "COMPLETION", dimension: "entryYear", programId })
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.benchmark).toBeDefined();
      expect(res.body.data.benchmark.value).toBe(70); // From ruleSet
    });
  });

  describe("GET /api/equity/breakdown/export", () => {
    beforeEach(async () => {
      // Create a student with enrollment and classification
      const student = await prisma.student.create({
        data: { institutionId, internalStudentId: `EXPORT-1-${Date.now()}`, firstName: "Export", lastName: "Test" },
      });

      const enrollment = await prisma.studentEnrollment.create({
        data: {
          studentId: student.id,
          programId,
          campusId,
          enrollmentStatus: "ACTIVE",
          startDate: new Date("2024-07-01"),
        },
      });

      await prisma.studentClassification.create({
        data: {
          studentEnrollmentId: enrollment.id,
          reportingPeriodId,
          metric: "COMPLETION",
          classificationCode: "TEST",
          determinedByRuleSetId: ruleSetId,
          explanation: { create: { countsInNumerator: true, countsInDenominator: true, reasonText: "Test" } },
        },
        include: { explanation: true },
      });

      await prisma.studentDemographics.create({
        data: { studentId: student.id, gender: "FEMALE" },
      });
    });

    it("should export equity breakdown as Excel workbook", async () => {
      const res = await request(app)
        .get("/api/equity/breakdown/export")
        .query({ metric: "COMPLETION", dimension: "gender", programId })
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.type).toMatch(/spreadsheet|excel|octet-stream/);
      expect(res.body).toBeDefined();
    });
  });

  describe("Program scoping", () => {
    let program2Id: number;
    let scopedAdminToken: string;

    beforeEach(async () => {
      // Create second program
      const program2 = await prisma.program.create({
        data: {
          institutionId,
          campusId,
          name: "Program 2",
          code: "TEST2",
          credentialType: "Certificate",
          licensureRequired: false,
        },
      });
      program2Id = program2.id;

      // Create a scoped admin
      const passwordHash = await hashPassword("password123");
      const scopedEmail = `scoped-equity-${Date.now()}@example.com`;
      const scopedAdmin = await prisma.user.create({
        data: {
          institutionId,
          name: "Scoped Admin",
          email: scopedEmail,
          passwordHash,
          role: "PROGRAM_ADMINISTRATOR",
        },
      });

      // Grant access to program 1 only
      await prisma.userProgramAccess.create({
        data: { userId: scopedAdmin.id, programId },
      });

      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({ email: scopedEmail, password: "password123" });
      scopedAdminToken = loginRes.body.data.accessToken;
    });

    it("should return 404 for out-of-scope program", async () => {
      const res = await request(app)
        .get("/api/equity/breakdown")
        .query({ metric: "COMPLETION", dimension: "entryYear", programId: program2Id })
        .set("Authorization", `Bearer ${scopedAdminToken}`);

      expect(res.status).toBe(404);
    });

    it("should allow access to in-scope program", async () => {
      const res = await request(app)
        .get("/api/equity/breakdown")
        .query({ metric: "COMPLETION", dimension: "entryYear", programId })
        .set("Authorization", `Bearer ${scopedAdminToken}`);

      expect(res.status).toBe(200);
    });
  });
});
