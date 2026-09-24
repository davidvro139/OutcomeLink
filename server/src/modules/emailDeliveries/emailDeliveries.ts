import { EMAIL_DELIVERY_STATUSES, EMAIL_PURPOSES } from "@outcomelink/shared";
import type { Request, Response } from "express";
import { z } from "zod";
import { sendData } from "../../lib/apiResponse";
import { paginatedResponse } from "../../lib/crudHelpers";
import { isMailConfigured } from "../../lib/mailer";
import { paginationQuerySchema } from "../../lib/pagination";
import { prisma } from "../../lib/prisma";

export const listEmailDeliveriesQuerySchema = paginationQuerySchema.extend({
  status: z.enum(EMAIL_DELIVERY_STATUSES).optional(),
  purpose: z.enum(EMAIL_PURPOSES).optional(),
});
type ListEmailDeliveriesQuery = z.infer<typeof listEmailDeliveriesQuerySchema>;

/** The institution's email log — every message actually attempted, and how it went. */
export async function list(req: Request, res: Response) {
  const { page, pageSize, status, purpose } = req.query as unknown as ListEmailDeliveriesQuery;
  const where = { institutionId: req.user!.institutionId, status, purpose };
  await paginatedResponse(
    res,
    page,
    pageSize,
    (skip, take) => prisma.emailDelivery.findMany({ where, skip, take, orderBy: { id: "desc" } }),
    () => prisma.emailDelivery.count({ where }),
  );
}

/** Whether emails are being sent at all — when not, the client explains that links are shown to copy instead. */
export async function status(_req: Request, res: Response) {
  sendData(res, { configured: isMailConfigured() });
}
