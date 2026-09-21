import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import * as batches from "./importBatches";
import * as connections from "./dataConnections";
import * as mappingProfiles from "./mappingProfiles";

const CAN_IMPORT = [
  "SYSTEM_ADMINISTRATOR",
  "INSTITUTIONAL_ADMINISTRATOR",
  "PROGRAM_ADMINISTRATOR",
] as const;

// Configuring a connection means handing this app a live external
// credential (a Dataverse/Azure AD app registration secret) — a higher bar
// than uploading a file, so this is narrower than CAN_IMPORT.
const CAN_MANAGE_CONNECTIONS = ["SYSTEM_ADMINISTRATOR", "INSTITUTIONAL_ADMINISTRATOR"] as const;

export const importsRouter = Router();

importsRouter.get("/mapping-profiles", requireAuth, asyncHandler(mappingProfiles.list));
importsRouter.post(
  "/mapping-profiles",
  requireAuth,
  requireRole(...CAN_IMPORT),
  validate(mappingProfiles.upsertMappingProfileSchema),
  asyncHandler(mappingProfiles.upsert),
);

importsRouter.get("/batches", requireAuth, asyncHandler(batches.list));
importsRouter.post(
  "/batches",
  requireAuth,
  requireRole(...CAN_IMPORT),
  batches.uploadMiddleware,
  validate(batches.createBatchSchema),
  asyncHandler(batches.create),
);
importsRouter.get("/batches/:id", requireAuth, asyncHandler(batches.show));
importsRouter.patch(
  "/batches/:id/mapping",
  requireAuth,
  requireRole(...CAN_IMPORT),
  validate(batches.setMappingSchema),
  asyncHandler(batches.setMapping),
);
importsRouter.post(
  "/batches/:id/validate",
  requireAuth,
  requireRole(...CAN_IMPORT),
  asyncHandler(batches.validateBatch),
);
importsRouter.get(
  "/batches/:id/preview",
  requireAuth,
  validate(batches.previewQuerySchema, "query"),
  asyncHandler(batches.preview),
);
importsRouter.post(
  "/batches/:id/commit",
  requireAuth,
  requireRole(...CAN_IMPORT),
  asyncHandler(batches.commit),
);

importsRouter.get("/connections", requireAuth, requireRole(...CAN_MANAGE_CONNECTIONS), asyncHandler(connections.list));
importsRouter.post(
  "/connections",
  requireAuth,
  requireRole(...CAN_MANAGE_CONNECTIONS),
  validate(connections.createConnectionSchema),
  asyncHandler(connections.create),
);
importsRouter.patch(
  "/connections/:id",
  requireAuth,
  requireRole(...CAN_MANAGE_CONNECTIONS),
  validate(connections.updateConnectionSchema),
  asyncHandler(connections.update),
);
importsRouter.delete(
  "/connections/:id",
  requireAuth,
  requireRole(...CAN_MANAGE_CONNECTIONS),
  asyncHandler(connections.remove),
);
importsRouter.post(
  "/connections/:id/test",
  requireAuth,
  requireRole(...CAN_MANAGE_CONNECTIONS),
  asyncHandler(connections.test),
);
importsRouter.post(
  "/connections/:id/import-batches",
  requireAuth,
  requireRole(...CAN_MANAGE_CONNECTIONS),
  asyncHandler(connections.createImportBatch),
);
