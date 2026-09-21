import type { BuiltInReportType, ScheduledReportFrequency, ScheduledReportRunStatus, ScheduledReportSource } from "@outcomelink/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, downloadFile } from "../lib/apiClient";

export interface ScheduledReportSubscription {
  id: number;
  name: string;
  frequency: ScheduledReportFrequency;
  reportSource: ScheduledReportSource;
  savedReportId: number | null;
  builtInReportType: BuiltInReportType | null;
  reportingPeriodId: number | null;
  active: boolean;
  createdAt: string;
  lastRunAt: string | null;
  nextRunAt: string;
  savedReport: { id: number; name: string } | null;
  reportingPeriod: { id: number; label: string } | null;
  creator: { id: number; name: string };
  runs: ScheduledReportRun[];
}

export interface ScheduledReportRun {
  id: number;
  subscriptionId: number;
  runAt: string;
  status: ScheduledReportRunStatus;
  errorMessage: string | null;
  fileReference: string | null;
  rowCount: number | null;
}

export type CreateScheduledReportSubscriptionInput =
  | { name: string; frequency: ScheduledReportFrequency; reportSource: "SAVED_REPORT"; savedReportId: number }
  | {
      name: string;
      frequency: ScheduledReportFrequency;
      reportSource: "BUILT_IN";
      builtInReportType: BuiltInReportType;
      reportingPeriodId?: number;
    };

export interface UpdateScheduledReportSubscriptionInput {
  name?: string;
  frequency?: ScheduledReportFrequency;
  active?: boolean;
}

const LIST_KEY = ["scheduled-reports"];
const runsKey = (subscriptionId: number) => ["scheduled-reports", subscriptionId, "runs"];

export function useScheduledReportSubscriptions() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: () =>
      apiRequest<{ subscriptions: ScheduledReportSubscription[] }>("/api/scheduled-reports").then(
        (r) => r.subscriptions,
      ),
  });
}

export function useCreateScheduledReportSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateScheduledReportSubscriptionInput) =>
      apiRequest<{ subscription: ScheduledReportSubscription }>("/api/scheduled-reports", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useUpdateScheduledReportSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateScheduledReportSubscriptionInput }) =>
      apiRequest<{ subscription: ScheduledReportSubscription }>(`/api/scheduled-reports/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useDeleteScheduledReportSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiRequest(`/api/scheduled-reports/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useRunScheduledReportNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<{ run: ScheduledReportRun }>(`/api/scheduled-reports/${id}/run-now`, { method: "POST" }),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: runsKey(id) });
      // A successful (or failed) run creates a Notification too — without this the bell
      // shows a stale inbox until its own 60s poll catches up (found in browser verification).
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useScheduledReportRuns(subscriptionId: number | undefined) {
  return useQuery({
    queryKey: subscriptionId === undefined ? runsKey(-1) : runsKey(subscriptionId),
    queryFn: () =>
      apiRequest<{ runs: ScheduledReportRun[] }>(`/api/scheduled-reports/${subscriptionId}/runs`).then(
        (r) => r.runs,
      ),
    enabled: subscriptionId !== undefined,
  });
}

export function downloadScheduledReportRun(runId: number): Promise<void> {
  return downloadFile(`/api/scheduled-reports/runs/${runId}/download`, `scheduled-report-${runId}.xlsx`);
}
