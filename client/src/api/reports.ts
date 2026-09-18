import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/apiClient";

export interface TimeToEmploymentReport {
  overall: { count: number; averageDays: number | null; medianDays: number | null };
  distribution: { immediate30: number; days31to60: number; days61to90: number; over90: number };
  byProgram: {
    program: { id: number; name: string };
    count: number;
    averageDays: number | null;
    medianDays: number | null;
  }[];
}

export function useTimeToEmploymentReport(reportingPeriodId: number | undefined) {
  return useQuery({
    queryKey: ["reports", "time-to-employment", reportingPeriodId],
    queryFn: () =>
      apiRequest<TimeToEmploymentReport>(
        `/api/reports/time-to-employment?reportingPeriodId=${reportingPeriodId}`,
      ),
    enabled: reportingPeriodId !== undefined,
  });
}

export interface PlacementQualityReport {
  totalPlacements: number;
  fullTimeRate: number;
  relatedRate: number;
  verifiedRate: number;
  averageWage: number | null;
  medianWage: number | null;
  wageRecordCount: number;
}

export function usePlacementQualityReport(reportingPeriodId: number | undefined) {
  return useQuery({
    queryKey: ["reports", "placement-quality", reportingPeriodId],
    queryFn: () =>
      apiRequest<PlacementQualityReport>(
        `/api/reports/placement-quality?reportingPeriodId=${reportingPeriodId}`,
      ),
    enabled: reportingPeriodId !== undefined,
  });
}

export interface OutcomeFunnelReport {
  stages: { stage: string; count: number }[];
}

export function useOutcomeFunnelReport(reportingPeriodId: number | undefined) {
  return useQuery({
    queryKey: ["reports", "outcome-funnel", reportingPeriodId],
    queryFn: () =>
      apiRequest<OutcomeFunnelReport>(`/api/reports/outcome-funnel?reportingPeriodId=${reportingPeriodId}`),
    enabled: reportingPeriodId !== undefined,
  });
}

export interface UnknownOutcomesReport {
  totalSeekingOrUnknown: number;
  totalMissingRecord: number;
  students: {
    student: { id: number; firstName: string; lastName: string };
    program: { id: number; name: string } | null;
  }[];
  byProgram: {
    program: { id: number; name: string } | null;
    seekingOrUnknown: number;
    missingRecord: number;
  }[];
}

export function useUnknownOutcomesReport(reportingPeriodId: number | undefined) {
  return useQuery({
    queryKey: ["reports", "unknown-outcomes", reportingPeriodId],
    queryFn: () =>
      apiRequest<UnknownOutcomesReport>(
        `/api/reports/unknown-outcomes?reportingPeriodId=${reportingPeriodId}`,
      ),
    enabled: reportingPeriodId !== undefined,
  });
}

export interface FollowUpEffectivenessReport {
  totalAttempts: number;
  resolvingRate: number;
  byOutcome: { outcome: string; count: number }[];
  byStaff: { staffUser: { id: number; name: string }; attempts: number; resolvingRate: number }[];
}

export function useFollowUpEffectivenessReport() {
  return useQuery({
    queryKey: ["reports", "follow-up-effectiveness"],
    queryFn: () => apiRequest<FollowUpEffectivenessReport>("/api/reports/follow-up-effectiveness"),
  });
}

export type SkillDimension =
  | "technicalPreparednessRating"
  | "communicationRating"
  | "problemSolvingRating"
  | "professionalismRating";

export interface SkillsGapProgramRow {
  program: { id: number; name: string };
  responseCount: number;
  averages: Record<SkillDimension, number | null>;
  gaps: Record<SkillDimension, number | null>;
  skillsGapNotes: { employerName: string; note: string; submittedAt: string }[];
}

export interface SkillsGapReport {
  totalResponses: number;
  institutionAverages: Record<SkillDimension, number | null>;
  dimensionLabels: Record<SkillDimension, string>;
  byProgram: SkillsGapProgramRow[];
}

export function useSkillsGapReport() {
  return useQuery({
    queryKey: ["reports", "skills-gap"],
    queryFn: () => apiRequest<SkillsGapReport>("/api/reports/skills-gap"),
  });
}
