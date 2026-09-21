import request from "supertest";
import { createApp } from "../../app";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";

const app = createApp();

/**
 * DataSourceConnection talks to real external services (Azure AD's token
 * endpoint, a Dataverse environment's OData API) that don't exist in this
 * test environment — there is no live OneWorld/Dataverse tenant to test
 * against. These tests mock `fetch` with responses shaped exactly like
 * those services' own published, versioned API contracts (a bearer token
 * JSON body; an OData `{ value: [...], "@odata.nextLink"?: string }` body),
 * so they verify this app's own request/response handling — auth flow,
 * pagination, header extraction, error surfacing — is correct against the
 * documented contract, not that any particular real tenant or OneWorld
 * schema behaves this way. The first real run against an actual OneWorld
 * environment is unverified by this suite and should expect field-mapping
 * surprises specific to that tenant.
 */

interface MockResponseSpec {
  status: number;
  json?: unknown;
  text?: string;
}

function fakeResponse(spec: MockResponseSpec): Response {
  return {
    ok: spec.status >= 200 && spec.status < 300,
    status: spec.status,
    json: async () => spec.json,
    text: async () => spec.text ?? JSON.stringify(spec.json ?? {}),
  } as Response;
}

/** Routes by URL: Azure AD token calls consume tokenResponses in order, Dataverse calls consume dataverseResponses in order. */
function mockFetch(tokenResponses: MockResponseSpec[], dataverseResponses: MockResponseSpec[]) {
  let tokenIndex = 0;
  let dataverseIndex = 0;
  return jest.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
    if (url.includes("login.microsoftonline.com")) {
      return fakeResponse(tokenResponses[tokenIndex++]!);
    }
    return fakeResponse(dataverseResponses[dataverseIndex++]!);
  });
}

const VALID_TOKEN_RESPONSE: MockResponseSpec = { status: 200, json: { access_token: "fake-token" } };

describe("data source connections (integration)", () => {
  let institutionId: number;
  let otherInstitutionId: number;
  let adminToken: string;
  let programAdminToken: string;
  let otherAdminToken: string;

  beforeAll(async () => {
    const institution = await prisma.institution.create({ data: { name: "Data Connections Test Institution" } });
    institutionId = institution.id;
    const otherInstitution = await prisma.institution.create({ data: { name: "Other Data Connections Institution" } });
    otherInstitutionId = otherInstitution.id;

    const passwordHash = await hashPassword("password123");
    await prisma.user.create({
      data: { institutionId, name: "Admin", email: "admin@dataconn-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
    await prisma.user.create({
      data: { institutionId, name: "ProgAdmin", email: "progadmin@dataconn-test.edu", passwordHash, role: "PROGRAM_ADMINISTRATOR" },
    });
    await prisma.user.create({
      data: { institutionId: otherInstitutionId, name: "Other Admin", email: "admin@other-dataconn-test.edu", passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });

    adminToken = (await request(app).post("/api/auth/login").send({ email: "admin@dataconn-test.edu", password: "password123" })).body.data.accessToken;
    programAdminToken = (await request(app).post("/api/auth/login").send({ email: "progadmin@dataconn-test.edu", password: "password123" })).body.data.accessToken;
    otherAdminToken = (await request(app).post("/api/auth/login").send({ email: "admin@other-dataconn-test.edu", password: "password123" })).body.data.accessToken;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const CONNECTION_INPUT = {
    name: "OneWorld Production",
    environmentUrl: "https://org12345.crm.dynamics.com",
    tenantId: "tenant-abc-123",
    clientId: "client-xyz-789",
    clientSecret: "super-secret-value",
    entityLogicalName: "new_students",
  };

  it("rejects a Program Administrator from creating a connection", async () => {
    const res = await request(app)
      .post("/api/imports/connections")
      .set("Authorization", `Bearer ${programAdminToken}`)
      .send(CONNECTION_INPUT);
    expect(res.status).toBe(403);
  });

  let connectionId: number;

  it("creates a connection and never returns the client secret", async () => {
    const res = await request(app)
      .post("/api/imports/connections")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(CONNECTION_INPUT);

    expect(res.status).toBe(201);
    expect(res.body.data.connection).toMatchObject({
      name: "OneWorld Production",
      environmentUrl: "https://org12345.crm.dynamics.com",
      entityLogicalName: "new_students",
    });
    expect(res.body.data.connection.clientSecret).toBeUndefined();
    expect(res.body.data.connection.clientSecretEncrypted).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/super-secret-value/);
    connectionId = res.body.data.connection.id;

    const stored = await prisma.dataSourceConnection.findUnique({ where: { id: connectionId } });
    expect(stored!.clientSecretEncrypted).not.toBe("super-secret-value");
    expect(stored!.clientSecretEncrypted.length).toBeGreaterThan(0);
  });

  it("rejects creating a second connection with the same name for the same institution, cleanly", async () => {
    const res = await request(app)
      .post("/api/imports/connections")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(CONNECTION_INPUT);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/already exists/i);
  });

  it("rejects renaming a connection to a name already used by another connection, cleanly", async () => {
    const secondRes = await request(app)
      .post("/api/imports/connections")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...CONNECTION_INPUT, name: "OneWorld Staging" });
    expect(secondRes.status).toBe(201);

    const renameRes = await request(app)
      .patch(`/api/imports/connections/${secondRes.body.data.connection.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "OneWorld Production" });
    expect(renameRes.status).toBe(409);

    await request(app)
      .delete(`/api/imports/connections/${secondRes.body.data.connection.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
  });

  it("lists connections scoped to the institution, without the secret", async () => {
    const res = await request(app).get("/api/imports/connections").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.connections).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toMatch(/super-secret-value/);

    const otherRes = await request(app).get("/api/imports/connections").set("Authorization", `Bearer ${otherAdminToken}`);
    expect(otherRes.body.data.connections).toHaveLength(0);
  });

  it("isolates a connection to its own institution", async () => {
    const res = await request(app)
      .patch(`/api/imports/connections/${connectionId}`)
      .set("Authorization", `Bearer ${otherAdminToken}`)
      .send({ name: "Hijacked" });
    expect(res.status).toBe(404);
  });

  it("updates a connection without requiring the secret to be re-entered", async () => {
    const res = await request(app)
      .patch(`/api/imports/connections/${connectionId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ entityLogicalName: "new_enrollments" });
    expect(res.status).toBe(200);
    expect(res.body.data.connection.entityLogicalName).toBe("new_enrollments");

    // Reset back for the rest of the suite.
    await request(app)
      .patch(`/api/imports/connections/${connectionId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ entityLogicalName: "new_students" });
  });

  it("tests the connection successfully against a mocked Dataverse response", async () => {
    mockFetch([VALID_TOKEN_RESPONSE], [
      { status: 200, json: { value: [{ new_studentid: "S-1", new_firstname: "Ada", "@odata.etag": "W/1" }] } },
    ]);

    const res = await request(app)
      .post(`/api/imports/connections/${connectionId}/test`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);
    expect(res.body.data.sampleColumns.sort()).toEqual(["new_firstname", "new_studentid"]);

    const stored = await prisma.dataSourceConnection.findUnique({ where: { id: connectionId } });
    expect(stored!.lastTestStatus).toBe("SUCCESS");
    expect(stored!.lastTestedAt).not.toBeNull();
  });

  it("surfaces a failed Azure AD authentication as a clear error, not a crash", async () => {
    mockFetch([{ status: 401, text: "AADSTS7000215: Invalid client secret provided." }], []);

    const res = await request(app)
      .post(`/api/imports/connections/${connectionId}/test`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200); // the HTTP call itself succeeds; the connection test result is what failed
    expect(res.body.data.success).toBe(false);
    expect(res.body.data.error).toMatch(/401/);

    const stored = await prisma.dataSourceConnection.findUnique({ where: { id: connectionId } });
    expect(stored!.lastTestStatus).toBe("FAILED");
    expect(stored!.lastTestError).toMatch(/401/);
  });

  it("creates an import batch by fetching live rows (following pagination, excluding OData metadata columns) and commits it through the ordinary pipeline unchanged", async () => {
    mockFetch(
      [VALID_TOKEN_RESPONSE],
      [
        {
          status: 200,
          json: {
            value: [{ new_studentid: "OW-1", new_firstname: "Ola", new_lastname: "Olsen", "@odata.etag": "W/1" }],
            "@odata.nextLink": "https://org12345.crm.dynamics.com/api/data/v9.2/new_students?page=2",
          },
        },
        {
          status: 200,
          json: { value: [{ new_studentid: "OW-2", new_firstname: "Wendy", new_lastname: "Wu", _ownerid_value: "guid-1" }] },
        },
      ],
    );

    const res = await request(app)
      .post(`/api/imports/connections/${connectionId}/import-batches`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(201);
    expect(res.body.data.batch.dataSourceConnectionId).toBe(connectionId);
    expect(res.body.data.batch.sourceSystem).toBe("OneWorld Production");
    expect(res.body.data.batch.totalRows).toBe(2);
    expect(res.body.data.sourceColumns.sort()).toEqual(["new_firstname", "new_lastname", "new_studentid"]);

    // From here on this is a completely ordinary ImportBatch — prove it by
    // running it through the exact same mapping/validate/preview/commit
    // pipeline a file upload would use, with no special-casing anywhere.
    const batchId = res.body.data.batch.id;

    const badMappingRes = await request(app)
      .patch(`/api/imports/batches/${batchId}/mapping`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ columnMapping: { new_studentid: "internalStudentId", new_firstname: "firstName" } });
    expect(badMappingRes.status).toBe(400); // lastName required and unmapped — real validation, not a bypass

    const mappingRes = await request(app)
      .patch(`/api/imports/batches/${batchId}/mapping`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        columnMapping: {
          new_studentid: "internalStudentId",
          new_firstname: "firstName",
          new_lastname: "lastName",
        },
      });
    expect(mappingRes.status).toBe(200);

    const validateRes = await request(app)
      .post(`/api/imports/batches/${batchId}/validate`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(validateRes.body.data.validRowCount).toBe(2);
    expect(validateRes.body.data.errorRowCount).toBe(0);

    const commitRes = await request(app)
      .post(`/api/imports/batches/${batchId}/commit`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(commitRes.status).toBe(200);
    expect(commitRes.body.data.importedRowCount).toBe(2);

    const ola = await prisma.student.findFirst({ where: { institutionId, internalStudentId: "OW-1" } });
    expect(ola).toMatchObject({ firstName: "Ola", lastName: "Olsen" });
  });

  it("rejects fetching a batch when the entity returns no rows", async () => {
    mockFetch([VALID_TOKEN_RESPONSE], [{ status: 200, json: { value: [] } }]);

    const res = await request(app)
      .post(`/api/imports/connections/${connectionId}/import-batches`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("surfaces a Dataverse/Azure AD failure from Fetch Now as a clean 400, not a generic 500", async () => {
    mockFetch([{ status: 401, text: "AADSTS7000215: Invalid client secret provided." }], []);

    const res = await request(app)
      .post(`/api/imports/connections/${connectionId}/import-batches`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/401/);
    expect(res.body.error.code).not.toBe("INTERNAL_SERVER_ERROR");
  });

  it("deletes a connection", async () => {
    const res = await request(app)
      .delete(`/api/imports/connections/${connectionId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const list = await request(app).get("/api/imports/connections").set("Authorization", `Bearer ${adminToken}`);
    expect(list.body.data.connections).toHaveLength(0);
  });
});
