import ExcelJS from "exceljs";
import request from "supertest";
import { createApp } from "../../app";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";

const app = createApp();

async function buildXlsxBuffer(headers: string[], rows: string[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const CSV_HEADER = "Student ID,First,Last,Email";
const CSV_ROWS = [
  "S-100,Alice,Anderson,alice@example.com", // valid
  "S-101,Bob,Brown,bob@example.com", // valid
  "S-101,Bobby,Brownstone,bobby@example.com", // duplicate id within file (row 3, first seen row 2)
  ",NoId,Missing,noone@example.com", // missing internalStudentId
  "S-102,,MissingFirst,x@example.com", // missing firstName
  "S-EXISTING,Carl,Carlson,carl@example.com", // collides with a student already in the DB
];
const CSV_CONTENT = [CSV_HEADER, ...CSV_ROWS].join("\n");

const MAPPING = {
  "Student ID": "internalStudentId",
  First: "firstName",
  Last: "lastName",
  Email: "email",
};

describe("bulk student import (integration)", () => {
  let institutionId: number;
  let otherInstitutionId: number;
  let adminToken: string;
  let auditorToken: string;
  let otherAdminToken: string;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Imports Test Institution" } });
    institutionId = institution.id;
    const otherInstitution = await prisma.institution.create({ data: { name: "Other Imports Institution" } });
    otherInstitutionId = otherInstitution.id;

    await prisma.student.create({
      data: { institutionId, internalStudentId: "S-EXISTING", firstName: "Already", lastName: "Here" },
    });

    const passwordHash = await hashPassword("password123");
    await prisma.user.create({
      data: { institutionId, name: "Admin", email: "admin@imports-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    await prisma.user.create({
      data: { institutionId, name: "Auditor", email: "auditor@imports-test.edu", passwordHash, role: "READ_ONLY_AUDITOR" },
    });
    await prisma.user.create({
      data: { institutionId: otherInstitutionId, name: "Other Admin", email: "admin@other-imports-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });

    adminToken = (await request(app).post("/api/auth/login").send({ email: "admin@imports-test.edu", password: "password123" })).body.data.accessToken;
    auditorToken = (await request(app).post("/api/auth/login").send({ email: "auditor@imports-test.edu", password: "password123" })).body.data.accessToken;
    otherAdminToken = (await request(app).post("/api/auth/login").send({ email: "admin@other-imports-test.edu", password: "password123" })).body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects a Read-Only Auditor from uploading a batch", async () => {
    const res = await request(app)
      .post("/api/imports/batches")
      .set("Authorization", `Bearer ${auditorToken}`)
      .field("sourceSystem", "TestSIS")
      .attach("file", Buffer.from(CSV_CONTENT), "roster.csv");
    expect(res.status).toBe(403);
  });

  let batchId: number;

  it("uploads a CSV and detects its columns", async () => {
    const res = await request(app)
      .post("/api/imports/batches")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("sourceSystem", "TestSIS")
      .attach("file", Buffer.from(CSV_CONTENT), "roster.csv");

    expect(res.status).toBe(201);
    expect(res.body.data.sourceColumns).toEqual(["Student ID", "First", "Last", "Email"]);
    expect(res.body.data.batch).toMatchObject({
      sourceSystem: "TestSIS",
      status: "UPLOADED",
      totalRows: 6,
      originalFilename: "roster.csv",
    });
    expect(res.body.data.suggestedProfile).toBeNull();
    batchId = res.body.data.batch.id;
  });

  it("isolates the batch to its own institution", async () => {
    const res = await request(app)
      .get(`/api/imports/batches/${batchId}`)
      .set("Authorization", `Bearer ${otherAdminToken}`);
    expect(res.status).toBe(404);
  });

  it("returns the file's source columns from the detail endpoint too, not just on upload", async () => {
    const res = await request(app)
      .get(`/api/imports/batches/${batchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.sourceColumns).toEqual(["Student ID", "First", "Last", "Email"]);
  });

  it("rejects validating before a mapping is set", async () => {
    const res = await request(app)
      .post(`/api/imports/batches/${batchId}/validate`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("rejects a mapping missing a required target field", async () => {
    const res = await request(app)
      .patch(`/api/imports/batches/${batchId}/mapping`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ columnMapping: { "Student ID": "internalStudentId" } });
    expect(res.status).toBe(400);
  });

  it("rejects a mapping referencing a column not in the file", async () => {
    const res = await request(app)
      .patch(`/api/imports/batches/${batchId}/mapping`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ columnMapping: { ...MAPPING, "Not A Real Column": "phone" } });
    expect(res.status).toBe(400);
  });

  it("sets a valid mapping and saves it as a reusable profile", async () => {
    const res = await request(app)
      .patch(`/api/imports/batches/${batchId}/mapping`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ columnMapping: MAPPING, saveAsProfile: true });

    expect(res.status).toBe(200);
    expect(res.body.data.batch.status).toBe("MAPPED");

    const profiles = await request(app)
      .get("/api/imports/mapping-profiles")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(profiles.body.data.mappingProfiles).toContainEqual(
      expect.objectContaining({ sourceSystemName: "TestSIS", columnMapping: MAPPING }),
    );
  });

  it("suggests the saved profile on the next upload for the same source system", async () => {
    const res = await request(app)
      .post("/api/imports/batches")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("sourceSystem", "TestSIS")
      .attach("file", Buffer.from(CSV_CONTENT), "roster2.csv");
    expect(res.body.data.suggestedProfile).toMatchObject({ sourceSystemName: "TestSIS", columnMapping: MAPPING });
  });

  it("validates the file, flagging exactly the 4 bad rows with the right reasons", async () => {
    const res = await request(app)
      .post(`/api/imports/batches/${batchId}/validate`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.validRowCount).toBe(2);
    expect(res.body.data.errorRowCount).toBe(4);
    expect(res.body.data.batch.status).toBe("VALIDATED");

    const detail = await request(app)
      .get(`/api/imports/batches/${batchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    const byRow = new Map(detail.body.data.rowErrors.map((e: { rowNumber: number; errorMessage: string }) => [e.rowNumber, e.errorMessage]));
    expect(byRow.get(3)).toMatch(/duplicate.*first seen at row 2/i);
    expect(byRow.get(4)).toMatch(/required/i);
    expect(byRow.get(5)).toMatch(/required/i);
    expect(byRow.get(6)).toMatch(/already exists/i);
  });

  it("previews only the valid rows, moving the batch to PREVIEWED", async () => {
    const res = await request(app)
      .get(`/api/imports/batches/${batchId}/preview`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalValidRows).toBe(2);
    expect(res.body.data.totalErrorRows).toBe(4);
    expect(res.body.data.items.map((r: { candidate: { internalStudentId: string } }) => r.candidate.internalStudentId)).toEqual([
      "S-100",
      "S-101",
    ]);

    const detail = await request(app)
      .get(`/api/imports/batches/${batchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(detail.body.data.batch.status).toBe("PREVIEWED");
  });

  it("rejects committing with a Read-Only Auditor", async () => {
    const res = await request(app)
      .post(`/api/imports/batches/${batchId}/commit`)
      .set("Authorization", `Bearer ${auditorToken}`);
    expect(res.status).toBe(403);
  });

  it("commits only the valid rows as real students", async () => {
    const res = await request(app)
      .post(`/api/imports/batches/${batchId}/commit`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.importedRowCount).toBe(2);
    expect(res.body.data.batch.status).toBe("IMPORTED");

    const alice = await prisma.student.findFirst({ where: { institutionId, internalStudentId: "S-100" } });
    const bob = await prisma.student.findFirst({ where: { institutionId, internalStudentId: "S-101" } });
    const badRows = await prisma.student.findMany({
      where: { institutionId, internalStudentId: { in: ["S-102", ""] } },
    });
    expect(alice).toMatchObject({ firstName: "Alice", lastName: "Anderson", email: "alice@example.com" });
    expect(bob).toMatchObject({ firstName: "Bob", lastName: "Brown" });
    expect(badRows).toHaveLength(0);
  });

  it("refuses to commit an already-imported batch a second time without re-validating", async () => {
    const res = await request(app)
      .post(`/api/imports/batches/${batchId}/commit`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);

    const countAlice = await prisma.student.count({ where: { institutionId, internalStudentId: "S-100" } });
    expect(countAlice).toBe(1);
  });

  it("re-validating the same file after commit now flags the just-imported rows as already existing", async () => {
    const validateRes = await request(app)
      .post(`/api/imports/batches/${batchId}/validate`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(validateRes.body.data.validRowCount).toBe(0);
    expect(validateRes.body.data.errorRowCount).toBe(6);

    const commitRes = await request(app)
      .post(`/api/imports/batches/${batchId}/commit`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(commitRes.status).toBe(400);

    const countAlice = await prisma.student.count({ where: { institutionId, internalStudentId: "S-100" } });
    expect(countAlice).toBe(1);
  });

  it("skips a row that collides at the database level between validate and commit, instead of crashing", async () => {
    const csv = [CSV_HEADER, "S-RACE,Race,Condition,race@example.com"].join("\n");
    const uploadRes = await request(app)
      .post("/api/imports/batches")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("sourceSystem", "TestSIS")
      .attach("file", Buffer.from(csv), "race.csv");
    const raceBatchId = uploadRes.body.data.batch.id;

    await request(app)
      .patch(`/api/imports/batches/${raceBatchId}/mapping`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ columnMapping: MAPPING });

    const validateRes = await request(app)
      .post(`/api/imports/batches/${raceBatchId}/validate`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(validateRes.body.data.validRowCount).toBe(1);

    // Simulate a concurrent import/manual entry creating the same student
    // after this batch was validated but before it was committed.
    await prisma.student.create({
      data: { institutionId, internalStudentId: "S-RACE", firstName: "Someone", lastName: "Else" },
    });

    const commitRes = await request(app)
      .post(`/api/imports/batches/${raceBatchId}/commit`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(commitRes.status).toBe(200);
    expect(commitRes.body.data.importedRowCount).toBe(0);

    const raceStudents = await prisma.student.findMany({ where: { institutionId, internalStudentId: "S-RACE" } });
    expect(raceStudents).toHaveLength(1);
    expect(raceStudents[0]).toMatchObject({ firstName: "Someone", lastName: "Else" });
  });

  it("accepts an Excel (.xlsx) upload and imports it identically to a CSV", async () => {
    const buffer = await buildXlsxBuffer(
      ["Student ID", "First", "Last", "Email"],
      [
        ["S-XL-1", "Xena", "Excel", "xena@example.com"],
        ["S-XL-1", "Xena", "Excel", "xena@example.com"], // duplicate within file
      ],
    );
    const uploadRes = await request(app)
      .post("/api/imports/batches")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("sourceSystem", "TestSIS")
      .attach("file", buffer, "roster.xlsx");
    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.data.sourceColumns).toEqual(["Student ID", "First", "Last", "Email"]);
    const xlsxBatchId = uploadRes.body.data.batch.id;

    await request(app)
      .patch(`/api/imports/batches/${xlsxBatchId}/mapping`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ columnMapping: MAPPING });

    const validateRes = await request(app)
      .post(`/api/imports/batches/${xlsxBatchId}/validate`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(validateRes.body.data.validRowCount).toBe(1);
    expect(validateRes.body.data.errorRowCount).toBe(1);

    const commitRes = await request(app)
      .post(`/api/imports/batches/${xlsxBatchId}/commit`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(commitRes.body.data.importedRowCount).toBe(1);

    const xena = await prisma.student.findFirst({ where: { institutionId, internalStudentId: "S-XL-1" } });
    expect(xena).toMatchObject({ firstName: "Xena", lastName: "Excel" });
  });

  it("rejects an unsupported file type", async () => {
    const res = await request(app)
      .post("/api/imports/batches")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("sourceSystem", "TestSIS")
      .attach("file", Buffer.from("not a spreadsheet"), "roster.txt");
    expect(res.status).toBe(400);
  });
});

describe("enrollment import (integration)", () => {
  let institutionId: number;
  let campusId: number;
  let sdProgramId: number;
  let cyberProgramId: number;
  let adminToken: string;

  const ENROLLMENT_MAPPING = {
    "Student ID": "internalStudentId",
    First: "firstName",
    Last: "lastName",
    "Program Code": "programCode",
    "Start Date": "startDate",
    Status: "enrollmentStatus",
  };

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Enrollment Import Test Institution" } });
    institutionId = institution.id;

    const campus = await prisma.campus.create({ data: { institutionId, name: "Main Campus" } });
    campusId = campus.id;
    const sdProgram = await prisma.program.create({
      data: { institutionId, campusId, name: "Software Development", code: "SD-100", credentialType: "Diploma" },
    });
    sdProgramId = sdProgram.id;
    const cyberProgram = await prisma.program.create({
      data: { institutionId, campusId, name: "Cybersecurity", code: "CYBER-100", credentialType: "Diploma" },
    });
    cyberProgramId = cyberProgram.id;

    await prisma.student.create({
      data: { institutionId, internalStudentId: "ENR-EXISTING", firstName: "Carla", lastName: "Existing" },
    });

    const passwordHash = await hashPassword("password123");
    await prisma.user.create({
      data: { institutionId, name: "Admin", email: "admin@enroll-import-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    adminToken = (
      await request(app).post("/api/auth/login").send({ email: "admin@enroll-import-test.edu", password: "password123" })
    ).body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects a mapping that maps only some enrollment fields", async () => {
    const uploadRes = await request(app)
      .post("/api/imports/batches")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("sourceSystem", "Northstar")
      .attach("file", Buffer.from("Student ID,First,Last,Program Code\nX,Y,Z,SD-100"), "partial.csv");

    const res = await request(app)
      .patch(`/api/imports/batches/${uploadRes.body.data.batch.id}/mapping`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        columnMapping: {
          "Student ID": "internalStudentId",
          First: "firstName",
          Last: "lastName",
          "Program Code": "programCode",
        },
      });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/enrollment field requires/i);
  });

  let batchId: number;

  it("validates an enrollment-mapped file: not-found program, bad status enum, and missing start date", async () => {
    const rows = [
      "ENR-1,New,Student,SD-100,2025-08-15,ACTIVE",
      "ENR-EXISTING,Carla,Existing,CYBER-100,2025-08-20,ACTIVE",
      "ENR-BADPROGRAM,Bad,Program,NOTREAL,2025-08-15,ACTIVE",
      "ENR-BADSTATUS,Bad,Status,SD-100,2025-08-15,NOT_A_STATUS",
      "ENR-NODATE,No,Date,SD-100,,ACTIVE",
      "ENR-DOUBLE,Double,Major,SD-100,2025-08-15,ACTIVE",
      "ENR-DOUBLE,Double,Major,CYBER-100,2025-08-16,ACTIVE",
    ];
    const csv = ["Student ID,First,Last,Program Code,Start Date,Status", ...rows].join("\n");

    const uploadRes = await request(app)
      .post("/api/imports/batches")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("sourceSystem", "Northstar")
      .attach("file", Buffer.from(csv), "term.csv");
    batchId = uploadRes.body.data.batch.id;

    const mappingRes = await request(app)
      .patch(`/api/imports/batches/${batchId}/mapping`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ columnMapping: ENROLLMENT_MAPPING });
    expect(mappingRes.status).toBe(200);

    const validateRes = await request(app)
      .post(`/api/imports/batches/${batchId}/validate`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(validateRes.body.data.validRowCount).toBe(4);
    expect(validateRes.body.data.errorRowCount).toBe(3);

    const detail = await request(app)
      .get(`/api/imports/batches/${batchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    const byRow = new Map(
      detail.body.data.rowErrors.map((e: { rowNumber: number; errorMessage: string }) => [e.rowNumber, e.errorMessage]),
    );
    expect(byRow.get(3)).toMatch(/program code "NOTREAL" not found/i);
    expect(byRow.get(4)).toMatch(/unknown enrollment status "NOT_A_STATUS"/i);
    expect(byRow.get(5)).toMatch(/invalid date/i);
    // Row 2 (ENR-EXISTING, already in the DB) is NOT an error in enrollment-import mode.
    expect(byRow.has(2)).toBe(false);
  });

  it("commits new students, attaches enrollments to both new and pre-existing students, and allows a double-major in one file", async () => {
    const res = await request(app)
      .post(`/api/imports/batches/${batchId}/commit`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.importedRowCount).toBe(2); // ENR-1 and ENR-DOUBLE are new; ENR-EXISTING already existed
    expect(res.body.data.importedEnrollmentCount).toBe(4);
    expect(res.body.data.batch.importedEnrollmentCount).toBe(4);

    const enr1 = await prisma.student.findFirst({
      where: { institutionId, internalStudentId: "ENR-1" },
      include: { enrollments: true },
    });
    expect(enr1!.enrollments).toHaveLength(1);
    expect(enr1!.enrollments[0]).toMatchObject({ programId: sdProgramId, campusId, enrollmentStatus: "ACTIVE" });

    const existing = await prisma.student.findFirst({
      where: { institutionId, internalStudentId: "ENR-EXISTING" },
      include: { enrollments: true },
    });
    // Demographics from the file were NOT applied to the pre-existing student.
    expect(existing).toMatchObject({ firstName: "Carla", lastName: "Existing" });
    expect(existing!.enrollments).toHaveLength(1);
    expect(existing!.enrollments[0]).toMatchObject({ programId: cyberProgramId, campusId });

    const double = await prisma.student.findFirst({
      where: { institutionId, internalStudentId: "ENR-DOUBLE" },
      include: { enrollments: true },
    });
    expect(double!.enrollments).toHaveLength(2);
    expect(double!.enrollments.map((e) => e.programId).sort()).toEqual([sdProgramId, cyberProgramId].sort());
  });

  it("re-committing the same file after re-validating does not create duplicate enrollments", async () => {
    await request(app).post(`/api/imports/batches/${batchId}/validate`).set("Authorization", `Bearer ${adminToken}`);
    const res = await request(app)
      .post(`/api/imports/batches/${batchId}/commit`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.importedRowCount).toBe(0);
    expect(res.body.data.importedEnrollmentCount).toBe(0);

    const enr1 = await prisma.student.findFirst({
      where: { institutionId, internalStudentId: "ENR-1" },
      include: { enrollments: true },
    });
    expect(enr1!.enrollments).toHaveLength(1);
  });

  it("accepts a human-readable enrollment status label, not just the raw enum spelling", async () => {
    const csv = [
      "Student ID,First,Last,Program Code,Start Date,Status",
      "ENR-LABEL,Label,Case,SD-100,2025-08-15,Active", // title-case label, not "ACTIVE"
      "ENR-LABEL-BAD,Bad,Label,SD-100,2025-08-15,Not A Real Status",
    ].join("\n");

    const uploadRes = await request(app)
      .post("/api/imports/batches")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("sourceSystem", "Northstar")
      .attach("file", Buffer.from(csv), "labels.csv");
    const labelBatchId = uploadRes.body.data.batch.id;

    await request(app)
      .patch(`/api/imports/batches/${labelBatchId}/mapping`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ columnMapping: ENROLLMENT_MAPPING });

    const validateRes = await request(app)
      .post(`/api/imports/batches/${labelBatchId}/validate`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(validateRes.body.data.validRowCount).toBe(1);
    expect(validateRes.body.data.errorRowCount).toBe(1);

    const commitRes = await request(app)
      .post(`/api/imports/batches/${labelBatchId}/commit`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(commitRes.body.data.importedEnrollmentCount).toBe(1);

    const labelStudent = await prisma.student.findFirst({
      where: { institutionId, internalStudentId: "ENR-LABEL" },
      include: { enrollments: true },
    });
    expect(labelStudent!.enrollments[0]).toMatchObject({ enrollmentStatus: "ACTIVE" });
  });
});
