import type { Request, Response } from "express";
import { getAccessibleProgramIds, studentProgramScopeFilter } from "../../lib/accessScope";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";
import { cityLocation } from "../../lib/cityLocation";

/** Employment starts in the period, grouped at the employer's current location.
 * Access follows the same student-enrollment scope as placement detail routes;
 * this is not attribution of an employment record to a particular program.
 */
export async function geographicPlacements(req: Request, res: Response) {
  const institutionId = req.user!.institutionId;
  const period = await prisma.reportingPeriod.findFirst({
    where: { id: Number(req.query.reportingPeriodId), institutionId },
  });
  if (!period) throw ApiError.notFound("Reporting period not found");
  const programIds = await getAccessibleProgramIds(req.user!);
  const counts = await prisma.employmentRecord.groupBy({
    by: ["employerId"],
    where: {
      student: { institutionId, ...studentProgramScopeFilter(programIds) },
      employer: { institutionId },
      startDate: { gte: period.startDate, lte: period.endDate },
    },
    _count: { _all: true },
  });
  const employers = await prisma.employer.findMany({
    where: { institutionId, id: { in: counts.map((r) => r.employerId) } },
    select: { id: true, name: true, city: true, state: true },
  });
  const countByEmployer = new Map(counts.map((r) => [r.employerId, r._count._all]));
  type CityGroup = ReturnType<typeof cityLocation> & {
    placementCount: number;
    employers: { id: number; name: string; placementCount: number }[];
  };
  const cities = new Map<string, CityGroup>();
  for (const employer of employers) {
    const location = cityLocation(employer.city, employer.state);
    const group = cities.get(location.key) ?? { ...location, placementCount: 0, employers: [] };
    const placementCount = countByEmployer.get(employer.id) ?? 0;
    group.placementCount += placementCount;
    group.employers.push({ id: employer.id, name: employer.name, placementCount });
    cities.set(location.key, group);
  }
  const locations = [...cities.values()].sort((a, b) => b.placementCount - a.placementCount || a.key.localeCompare(b.key));
  for (const location of locations) location.employers.sort((a, b) => b.placementCount - a.placementCount || a.name.localeCompare(b.name));
  const totalPlacements = locations.reduce((sum, row) => sum + row.placementCount, 0);
  const mappedPlacements = locations.reduce((sum, row) =>
    sum + (row.latitude !== null && row.longitude !== null ? row.placementCount : 0), 0);
  sendData(res, {
    totalPlacements, mappedPlacements, unmappedPlacements: totalPlacements - mappedPlacements,
    locations,
  });
}
