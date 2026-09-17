import type { Request, Response } from "express";
import { IMPORT_TARGET_FIELDS } from "@outcomelink/shared";
import { z } from "zod";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";

export const columnMappingSchema = z
  .record(z.string(), z.enum(IMPORT_TARGET_FIELDS))
  .refine(
    (mapping) => {
      const targets = Object.values(mapping);
      return new Set(targets).size === targets.length;
    },
    { message: "Two source columns cannot map to the same target field" },
  );

export const upsertMappingProfileSchema = z.object({
  sourceSystemName: z.string().trim().min(1).max(200),
  columnMapping: columnMappingSchema,
});
type UpsertMappingProfileInput = z.infer<typeof upsertMappingProfileSchema>;

export async function list(req: Request, res: Response) {
  const institutionId = req.user!.institutionId;
  const mappingProfiles = await prisma.importMappingProfile.findMany({
    where: { institutionId },
    orderBy: { sourceSystemName: "asc" },
  });
  sendData(res, { mappingProfiles });
}

/** Saving a profile for a source-system name that already has one replaces its mapping. */
export async function upsert(
  req: Request<Record<string, never>, unknown, UpsertMappingProfileInput>,
  res: Response,
) {
  const institutionId = req.user!.institutionId;
  const { sourceSystemName, columnMapping } = req.body;

  const mappingProfile = await prisma.importMappingProfile.upsert({
    where: { institutionId_sourceSystemName: { institutionId, sourceSystemName } },
    create: { institutionId, sourceSystemName, columnMapping },
    update: { columnMapping },
  });
  sendData(res, { mappingProfile }, 201);
}
