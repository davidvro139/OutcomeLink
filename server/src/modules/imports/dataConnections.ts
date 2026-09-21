import type { Request, Response } from "express";
import { z } from "zod";
import { DataverseError, testConnection as testDataverseConnection, fetchEntityRows } from "../../lib/dataverse";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { stringifyCsv } from "../../lib/csv";
import { prisma } from "../../lib/prisma";
import { encryptSecret } from "../../lib/secrets";
import { createBatchFromBuffer } from "./importBatches";

/**
 * DataSourceConnection CRUD + actions (spec §64's "SIS/API integrations",
 * schema.prisma's DataSourceConnection doc comment has the full design
 * reasoning). Gated more tightly than the rest of Bulk Import — configuring
 * one means handing this app a live external credential, not just uploading
 * a file — see dataConnections.routes.ts's CAN_MANAGE_CONNECTIONS.
 */

const CONNECTION_SELECT = {
  id: true,
  institutionId: true,
  name: true,
  type: true,
  environmentUrl: true,
  tenantId: true,
  clientId: true,
  entityLogicalName: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
  lastTestedAt: true,
  lastTestStatus: true,
  lastTestError: true,
  // clientSecretEncrypted deliberately excluded — never returned to any client, ever.
} as const;

export const createConnectionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  environmentUrl: z.string().trim().url(),
  tenantId: z.string().trim().min(1).max(200),
  clientId: z.string().trim().min(1).max(200),
  clientSecret: z.string().trim().min(1),
  entityLogicalName: z.string().trim().min(1).max(200),
});
type CreateConnectionInput = z.infer<typeof createConnectionSchema>;

export const updateConnectionSchema = createConnectionSchema.partial();
type UpdateConnectionInput = z.infer<typeof updateConnectionSchema>;

async function findOwnedConnection(institutionId: number, id: number) {
  const connection = await prisma.dataSourceConnection.findFirst({ where: { id, institutionId } });
  if (!connection) throw ApiError.notFound("Data source connection not found");
  return connection;
}

export async function list(req: Request, res: Response) {
  const connections = await prisma.dataSourceConnection.findMany({
    where: { institutionId: req.user!.institutionId },
    select: CONNECTION_SELECT,
    orderBy: { name: "asc" },
  });
  sendData(res, { connections });
}

export async function create(
  req: Request<Record<string, never>, unknown, CreateConnectionInput>,
  res: Response,
) {
  const institutionId = req.user!.institutionId;

  const existingByName = await prisma.dataSourceConnection.findUnique({
    where: { institutionId_name: { institutionId, name: req.body.name } },
  });
  if (existingByName) throw ApiError.conflict(`A connection named "${req.body.name}" already exists`);

  const uploader = await prisma.user.findUnique({ where: { id: req.user!.sub }, select: { name: true } });

  const connection = await prisma.dataSourceConnection.create({
    data: {
      institutionId,
      name: req.body.name,
      environmentUrl: req.body.environmentUrl,
      tenantId: req.body.tenantId,
      clientId: req.body.clientId,
      clientSecretEncrypted: encryptSecret(req.body.clientSecret),
      entityLogicalName: req.body.entityLogicalName,
      createdBy: uploader?.name ?? String(req.user!.sub),
    },
    select: CONNECTION_SELECT,
  });
  sendData(res, { connection }, 201);
}

export async function update(
  req: Request<{ id: string }, unknown, UpdateConnectionInput>,
  res: Response,
) {
  const institutionId = req.user!.institutionId;
  const existing = await findOwnedConnection(institutionId, Number(req.params.id));
  const { clientSecret, ...rest } = req.body;

  if (rest.name && rest.name !== existing.name) {
    const collision = await prisma.dataSourceConnection.findUnique({
      where: { institutionId_name: { institutionId, name: rest.name } },
    });
    if (collision) throw ApiError.conflict(`A connection named "${rest.name}" already exists`);
  }

  const connection = await prisma.dataSourceConnection.update({
    where: { id: existing.id },
    data: {
      ...rest,
      ...(clientSecret ? { clientSecretEncrypted: encryptSecret(clientSecret) } : {}),
    },
    select: CONNECTION_SELECT,
  });
  sendData(res, { connection });
}

export async function remove(req: Request<{ id: string }>, res: Response) {
  const institutionId = req.user!.institutionId;
  const existing = await findOwnedConnection(institutionId, Number(req.params.id));
  await prisma.dataSourceConnection.delete({ where: { id: existing.id } });
  sendData(res, { deleted: true });
}

export async function test(req: Request<{ id: string }>, res: Response) {
  const institutionId = req.user!.institutionId;
  const connection = await findOwnedConnection(institutionId, Number(req.params.id));

  const result = await testDataverseConnection({
    environmentUrl: connection.environmentUrl,
    tenantId: connection.tenantId,
    clientId: connection.clientId,
    clientSecretEncrypted: connection.clientSecretEncrypted,
    entityLogicalName: connection.entityLogicalName,
  });

  await prisma.dataSourceConnection.update({
    where: { id: connection.id },
    data: {
      lastTestedAt: new Date(),
      lastTestStatus: result.success ? "SUCCESS" : "FAILED",
      lastTestError: result.error ?? null,
    },
  });

  sendData(res, result);
}

/** Fetches the connection's full entity set live and creates a normal ImportBatch from it — see importBatches.createBatchFromBuffer(). */
export async function createImportBatch(req: Request<{ id: string }>, res: Response) {
  const institutionId = req.user!.institutionId;
  const connection = await findOwnedConnection(institutionId, Number(req.params.id));

  let headers: string[];
  let rows: string[][];
  try {
    ({ headers, rows } = await fetchEntityRows({
      environmentUrl: connection.environmentUrl,
      tenantId: connection.tenantId,
      clientId: connection.clientId,
      clientSecretEncrypted: connection.clientSecretEncrypted,
      entityLogicalName: connection.entityLogicalName,
    }));
  } catch (err) {
    // Mirrors test()'s handling of the identical call — without this, a real
    // Dataverse/Azure AD failure here falls through to the generic 500
    // handler instead of the specific reason "Test" already surfaces for
    // the same connection.
    if (err instanceof DataverseError) throw ApiError.badRequest(err.message);
    throw err;
  }
  if (rows.length === 0) {
    throw ApiError.badRequest(`"${connection.entityLogicalName}" returned no rows to import`);
  }

  const csv = stringifyCsv(headers, rows);
  const result = await createBatchFromBuffer({
    institutionId,
    uploaderId: req.user!.sub,
    sourceSystem: connection.name,
    buffer: Buffer.from(csv, "utf8"),
    originalFilename: `${connection.name}-${new Date().toISOString().slice(0, 10)}.csv`,
    mimeType: "text/csv",
    dataSourceConnectionId: connection.id,
  });
  sendData(res, result, 201);
}
