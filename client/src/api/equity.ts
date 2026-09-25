import { useQuery } from "@tanstack/react-query";
import type { CplMetric, EquityDimension } from "@outcomelink/shared";
import { apiRequest, downloadFile } from "../lib/apiClient";

export interface EquityBreakdownParams {
  reportingPeriodId?: number;
  metric: CplMetric;
  dimension: EquityDimension;
  programId?: number;
}

export interface EquityBreakdownGroup {
  value: string;
  label: string;
  denominator: number;
  numerator: number | null;
  percentage: number | null;
  suppressed: boolean;
  status: "NO_DATA" | "SUPPRESSED" | "MEETING" | "BELOW_BENCHMARK";
}

export interface EquityBreakdownTrendPoint {
  label: string;
  percentage: number | null;
  benchmark: number | null;
}

export interface EquityBreakdownTrendSeries {
  label: string;
  points: EquityBreakdownTrendPoint[];
}

export interface EquityBreakdownResult {
  metric: CplMetric;
  dimension: EquityDimension;
  period: { id: number; label: string; endDate: string } | null;
  groups: EquityBreakdownGroup[];
  trend: EquityBreakdownTrendSeries[];
  coverage: { totalDenominator: number; withDataOnFile: number } | null;
  benchmark: { value: number } | null;
  scope: { programId?: number; programName?: string | null };
  suppressionThreshold: number;
}

export function useEquityBreakdown(params: EquityBreakdownParams) {
  const qs = new URLSearchParams();
  if (params.reportingPeriodId) qs.set("reportingPeriodId", String(params.reportingPeriodId));
  qs.set("metric", params.metric);
  qs.set("dimension", params.dimension);
  if (params.programId) qs.set("programId", String(params.programId));

  return useQuery<EquityBreakdownResult>({
    queryKey: ["equity", "breakdown", params],
    queryFn: () => apiRequest(`/api/equity/breakdown?${qs.toString()}`),
  });
}

export function downloadEquityBreakdown(
  params: EquityBreakdownParams,
  label: string,
): Promise<void> {
  const qs = new URLSearchParams();
  if (params.reportingPeriodId) qs.set("reportingPeriodId", String(params.reportingPeriodId));
  qs.set("metric", params.metric);
  qs.set("dimension", params.dimension);
  if (params.programId) qs.set("programId", String(params.programId));

  return downloadFile(`/api/equity/breakdown/export?${qs.toString()}`, `equity-${label}.xlsx`);
}
