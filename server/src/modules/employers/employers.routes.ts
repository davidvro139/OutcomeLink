import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import * as contacts from "./employerContacts";
import * as employers from "./employers";

const CAN_MANAGE_EMPLOYERS = [
  "SYSTEM_ADMINISTRATOR",
  "INSTITUTIONAL_ADMINISTRATOR",
  "CAREER_SERVICES_STAFF",
] as const;

export const employersRouter = Router();

employersRouter.get(
  "/",
  requireAuth,
  validate(employers.listEmployersQuerySchema, "query"),
  asyncHandler(employers.list),
);
employersRouter.get("/:id", requireAuth, asyncHandler(employers.show));
employersRouter.post(
  "/",
  requireAuth,
  requireRole(...CAN_MANAGE_EMPLOYERS),
  validate(employers.createEmployerSchema),
  asyncHandler(employers.create),
);
employersRouter.patch(
  "/:id",
  requireAuth,
  requireRole(...CAN_MANAGE_EMPLOYERS),
  validate(employers.updateEmployerSchema),
  asyncHandler(employers.update),
);

employersRouter.get("/:employerId/contacts", requireAuth, asyncHandler(contacts.list));
employersRouter.post(
  "/:employerId/contacts",
  requireAuth,
  requireRole(...CAN_MANAGE_EMPLOYERS),
  validate(contacts.createContactSchema),
  asyncHandler(contacts.create),
);
employersRouter.patch(
  "/:employerId/contacts/:id",
  requireAuth,
  requireRole(...CAN_MANAGE_EMPLOYERS),
  validate(contacts.updateContactSchema),
  asyncHandler(contacts.update),
);
employersRouter.delete(
  "/:employerId/contacts/:id",
  requireAuth,
  requireRole(...CAN_MANAGE_EMPLOYERS),
  asyncHandler(contacts.remove),
);
