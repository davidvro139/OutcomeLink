import type { Request, Response } from "express";
import { z } from "zod";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";

export const employerAnalyticsQuerySchema = z.object({
  reportingPeriodId: z.coerce.number().int().positive().optional(),
});
type EmployerAnalyticsQuery = z.infer<typeof employerAnalyticsQuerySchema>;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function concentrationRisk(topShare: number): "LOW" | "MODERATE" | "HIGH" {
  if (topShare >= 25) return "HIGH";
  if (topShare >= 10) return "MODERATE";
  return "LOW";
}

/**
 * Employer Relationship Analytics (Phase 2 P5, docs/TODO.md): which
 * employers are actually absorbing graduates, whether the institution is
 * dangerously dependent on a small number of them (spec's "Employer
 * Concentration/Pipeline" drill-down), and which industries placements
 * cluster in. Scoped to every EMPLOYED outcome record with an employer on
 * file — related-to-training or not, since this is about the real
 * relationship, not just the narrower COE "related placement" numerator —
 * optionally narrowed to one reporting period.
 */
export async function analytics(req: Request, res: Response) {
  const institutionId = req.user!.institutionId;
  const { reportingPeriodId } = req.query as unknown as EmployerAnalyticsQuery;

  const outcomeRecords = await prisma.studentOutcomeRecord.findMany({
    where: {
      employmentStatus: "EMPLOYED",
      employerId: { not: null },
      reportingPeriodId,
      studentEnrollment: { student: { institutionId } },
    },
    select: {
      employerId: true,
      relatedToTraining: true,
      employer: { select: { id: true, name: true, industry: true } },
    },
  });

  interface EmployerTotals {
    employer: { id: number; name: string; industry: string | null };
    placementCount: number;
    relatedPlacementCount: number;
  }
  const byEmployer = new Map<number, EmployerTotals>();
  for (const record of outcomeRecords) {
    if (!record.employerId || !record.employer) continue;
    const totals = byEmployer.get(record.employerId) ?? {
      employer: record.employer,
      placementCount: 0,
      relatedPlacementCount: 0,
    };
    totals.placementCount += 1;
    if (record.relatedToTraining) totals.relatedPlacementCount += 1;
    byEmployer.set(record.employerId, totals);
  }

  const topEmployers = [...byEmployer.values()].sort((a, b) => b.placementCount - a.placementCount);

  const totalPlacements = outcomeRecords.length;
  const top1Count = topEmployers[0]?.placementCount ?? 0;
  const top5Count = topEmployers.slice(0, 5).reduce((sum, e) => sum + e.placementCount, 0);
  const topEmployerShare = totalPlacements > 0 ? round2((top1Count / totalPlacements) * 100) : 0;
  const top5Share = totalPlacements > 0 ? round2((top5Count / totalPlacements) * 100) : 0;

  interface IndustryTotals {
    industry: string;
    placementCount: number;
    employerIds: Set<number>;
  }
  const byIndustry = new Map<string, IndustryTotals>();
  for (const record of outcomeRecords) {
    if (!record.employerId) continue;
    const industry = record.employer?.industry?.trim() || "Unspecified";
    const totals = byIndustry.get(industry) ?? { industry, placementCount: 0, employerIds: new Set() };
    totals.placementCount += 1;
    totals.employerIds.add(record.employerId);
    byIndustry.set(industry, totals);
  }
  const industryBreakdown = [...byIndustry.values()]
    .map((i) => ({
      industry: i.industry,
      placementCount: i.placementCount,
      employerCount: i.employerIds.size,
    }))
    .sort((a, b) => b.placementCount - a.placementCount);

  sendData(res, {
    topEmployers: topEmployers.slice(0, 20),
    industryBreakdown,
    concentration: {
      totalPlacements,
      distinctEmployerCount: byEmployer.size,
      topEmployerShare,
      top5Share,
      risk: concentrationRisk(topEmployerShare),
    },
  });
}
