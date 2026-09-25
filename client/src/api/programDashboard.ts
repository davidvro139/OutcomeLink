import type { CplMetric, RiskStatus } from "@outcomelink/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, downloadFile } from "../lib/apiClient";

export interface MetricAssessment {
  numerator: number;
  denominator: number;
  percentage: number;
  benchmark: number;
  negotiated: boolean;
  status: RiskStatus;
  needed: number | null;
  maxPossiblePercentage: number | null;
  pools: { numeratorOnly: number; both: number };
}

export interface TrendPoint {
  reportingPeriodId: number;
  label: string;
  percentage: number | null;
  benchmark: number | null;
}

export interface ProgramAssessment {
  programId: number;
  name: string;
  code: string | null;
  campusName: string | null;
  status: RiskStatus;
  metrics: Partial<Record<CplMetric, MetricAssessment>>;
  openIssueCount: number;
  unresolvedOutcomeCount: number;
  trend: Record<CplMetric, TrendPoint[]>;
}

export interface AttentionItem {
  severity: 1 | 2 | 3;
  programId: number | null;
  message: string;
  link: "reports" | "validation" | "results" | null;
}

export interface ProgramDashboard {
  period: {
    id: number;
    label: string;
    startDate: string;
    endDate: string;
    status: string;
    outcomesDeadline: string | null;
    daysUntilOutcomesDeadline: number | null;
  } | null;
  freshness: {
    computedAt: string | null;
    ageDays: number | null;
    neverComputed: boolean;
    stale: boolean;
  };
  summary: Record<RiskStatus, number>;
  programs: ProgramAssessment[];
  attention: AttentionItem[];
}

const KEY = ["dashboard", "programs"];

/** `periodId` undefined = the server's default (newest open period). */
export function useProgramDashboard(periodId: number | undefined) {
  const query = periodId ? `?reportingPeriodId=${periodId}` : "";
  return useQuery({
    queryKey: [...KEY, periodId ?? "default"],
    queryFn: () => apiRequest<ProgramDashboard>(`/api/dashboard/programs${query}`),
  });
}

export function useRecomputeDashboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (periodId: number) =>
      apiRequest<ProgramDashboard>(
        `/api/dashboard/programs/recompute?reportingPeriodId=${periodId}`,
        {
          method: "POST",
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      void queryClient.invalidateQueries({ queryKey: ["accreditation"] });
    },
  });
}

export function downloadProgramDashboard(periodId: number, label: string): Promise<void> {
  return downloadFile(
    `/api/dashboard/programs/export?reportingPeriodId=${periodId}`,
    `program-dashboard-${label}.xlsx`,
  );
}
