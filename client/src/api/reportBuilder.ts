import type { ReportDefinition } from "@outcomelink/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/apiClient";

export interface CustomReportResult {
  rows: Record<string, unknown>[];
  totalCount: number;
  truncated: boolean;
}

export function useRunCustomReport() {
  return useMutation({
    mutationFn: (definition: ReportDefinition) =>
      apiRequest<CustomReportResult>("/api/reports/custom/run", {
        method: "POST",
        body: JSON.stringify(definition),
      }),
  });
}

export interface SavedReport {
  id: number;
  name: string;
  definition: ReportDefinition;
  creator: { id: number; name: string };
  createdAt: string;
  updatedAt: string;
}

export function useSavedReports() {
  return useQuery({
    queryKey: ["reports", "custom", "saved"],
    queryFn: () =>
      apiRequest<{ savedReports: SavedReport[] }>("/api/reports/custom/saved").then(
        (r) => r.savedReports,
      ),
  });
}

export function useSaveReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; definition: ReportDefinition }) =>
      apiRequest<{ savedReport: SavedReport }>("/api/reports/custom/saved", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reports", "custom", "saved"] }),
  });
}

export function useDeleteSavedReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiRequest(`/api/reports/custom/saved/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reports", "custom", "saved"] }),
  });
}
