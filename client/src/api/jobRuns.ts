import type { JobRunStatus, JobTrigger, JobType } from "@outcomelink/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, apiRequestPaginated } from "../lib/apiClient";

export interface JobRun {
  id: number;
  institutionId: number | null;
  jobType: JobType;
  trigger: JobTrigger;
  requestedBy: number | null;
  status: JobRunStatus;
  attempt: number;
  maxAttempts: number;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  nextAttemptAt: string | null;
}

export interface JobRunFilters {
  jobType?: JobType;
  status?: JobRunStatus;
  page: number;
}

const KEY = ["job-runs"];

/** Polls while anything is running or waiting to retry — those rows change on their own. */
export function useJobRuns(filters: JobRunFilters, enabled = true) {
  const query = new URLSearchParams({ pageSize: "25", page: String(filters.page) });
  if (filters.jobType) query.set("jobType", filters.jobType);
  if (filters.status) query.set("status", filters.status);

  return useQuery({
    queryKey: [...KEY, filters],
    queryFn: () => apiRequestPaginated<JobRun>(`/api/job-runs?${query.toString()}`),
    enabled,
    placeholderData: (previousData) => previousData,
    refetchInterval: (q) =>
      q.state.data?.items.some((r) => r.status === "RUNNING" || r.status === "RETRY_PENDING")
        ? 5000
        : false,
  });
}

export function useRetryJobRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<{ run: JobRun }>(`/api/job-runs/${id}/retry`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
