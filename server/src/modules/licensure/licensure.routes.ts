import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { OPERATIONAL_ROLES } from "../../lib/roles";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import * as licensureResults from "./licensureResults";
import * as queue from "./queue";

export const licensureRouter = Router();

const BASE = "/students/:studentId/licensure-results";

licensureRouter.get(BASE, requireAuth, asyncHandler(licensureResults.list));
licensureRouter.post(
  BASE,
  requireAuth,
  requireRole(...OPERATIONAL_ROLES),
  validate(licensureResults.createLicensureResultSchema),
  asyncHandler(licensureResults.create),
);
licensureRouter.patch(
  `${BASE}/:id`,
  requireAuth,
  requireRole(...OPERATIONAL_ROLES),
  validate(licensureResults.updateLicensureResultSchema),
  asyncHandler(licensureResults.update),
);

licensureRouter.get("/licensure/queue", requireAuth, asyncHandler(queue.queue));
