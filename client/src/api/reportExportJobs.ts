import type { ReportDefinition } from "@outcomelink/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, downloadFile } from "../lib/apiClient";

export interface ReportExportJob {
  id: number;
  status: "PENDING" | "SUCCESS" | "FAILED";
  rowCount: number | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

const JOBS_KEY = ["reports", "custom", "export-jobs"];

export function useQueueReportExport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (definition: ReportDefinition) =>
      apiRequest<{ job: ReportExportJob }>("/api/reports/custom/export-jobs", {
        method: "POST",
        body: JSON.stringify(definition),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: JOBS_KEY }),
  });
}

/** Polls only while something is still PENDING — a queued export is something the user is actively waiting on. */
export function useReportExportJobs() {
  return useQuery({
    queryKey: JOBS_KEY,
    queryFn: () => apiRequest<{ jobs: ReportExportJob[] }>("/api/reports/custom/export-jobs").then((r) => r.jobs),
    refetchInterval: (query) => (query.state.data?.some((j) => j.status === "PENDING") ? 3000 : false),
  });
}

export function downloadReportExportJob(jobId: number): Promise<void> {
  return downloadFile(`/api/reports/custom/export-jobs/${jobId}/download`, `report-export-${jobId}.xlsx`);
}
