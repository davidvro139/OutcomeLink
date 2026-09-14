import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../../lib/apiError";
import { sendData } from "../../../lib/apiResponse";
import { prisma } from "../../../lib/prisma";

/**
 * The only part of a COE rule set that's actually configurable data rather
 * than code — the classification/calculation algorithm itself lives in
 * server/src/modules/accreditation/classifiers/coe2026.ts as versioned,
 * tested code, per docs/DATA_MODEL.md §13's design decision to defer a full
 * rule-interpreter DSL until a second framework actually needs one.
 * Percentages match docs/COE_RULE_MATRIX.md §6 (currently 60/70/70).
 */
export const ruleDefinitionSchema = z.object({
  benchmarks: z.object({
    completion: z.number().min(0).max(100),
    placement: z.number().min(0).max(100),
    licensure: z.number().min(0).max(100),
  }),
});
export type RuleDefinition = z.infer<typeof ruleDefinitionSchema>;

const RULE_DEFINITION_SCHEMA_VERSION = "1";

export const createRuleSetSchema = z.object({
  versionLabel: z.string().trim().min(1).max(100),
  effectiveStartDate: z.coerce.date(),
  effectiveEndDate: z.coerce.date().optional(),
  ruleDefinition: ruleDefinitionSchema,
});
type CreateRuleSetInput = z.infer<typeof createRuleSetSchema>;

export async function list(req: Request, res: Response) {
  const frameworkId = Number(req.params.frameworkId);
  const ruleSets = await prisma.ruleSet.findMany({
    where: { frameworkId },
    orderBy: { effectiveStartDate: "desc" },
  });
  sendData(res, { ruleSets });
}

export async function create(
  req: Request<{ frameworkId: string }, unknown, CreateRuleSetInput>,
  res: Response,
) {
  const frameworkId = Number(req.params.frameworkId);
  const framework = await prisma.accreditationFramework.findUnique({ where: { id: frameworkId } });
  if (!framework) throw ApiError.notFound("Accreditation framework not found");

  const ruleSet = await prisma.ruleSet.create({
    data: {
      frameworkId,
      versionLabel: req.body.versionLabel,
      effectiveStartDate: req.body.effectiveStartDate,
      effectiveEndDate: req.body.effectiveEndDate,
      ruleDefinition: req.body.ruleDefinition,
      ruleDefinitionSchemaVersion: RULE_DEFINITION_SCHEMA_VERSION,
    },
  });
  sendData(res, { ruleSet }, 201);
}
