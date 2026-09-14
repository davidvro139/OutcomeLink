import type { FollowUpMethod, FollowUpOutcome } from "@outcomelink/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, apiRequestPaginated } from "../lib/apiClient";

export interface QueueRow {
  student: { id: number; firstName: string; lastName: string };
  program: { id: number; name: string } | null;
  campus: { id: number; name: string } | null;
  attempts: number;
  lastContact: string | null;
  lastOutcome: FollowUpOutcome | null;
  nextFollowUpDate: string | null;
  assignedTo: { id: number; name: string } | null;
  daysOverdue: number;
}

export interface FollowUpAttempt {
  id: number;
  studentId: number;
  attemptedAt: string;
  method: FollowUpMethod;
  outcome: FollowUpOutcome;
  notes: string | null;
  nextFollowUpDate: string | null;
  staffUser?: { id: number; name: string };
}

export interface CreateFollowUpAttemptInput {
  attemptedAt: string;
  method: FollowUpMethod;
  outcome: FollowUpOutcome;
  notes?: string;
  nextFollowUpDate?: string;
}

export interface QueueFilters {
  minDaysOverdue?: number;
  programId?: number;
}

export function useFollowUpQueue(filters: QueueFilters = {}) {
  const query = new URLSearchParams({ pageSize: "50" });
  if (filters.minDaysOverdue) query.set("minDaysOverdue", String(filters.minDaysOverdue));
  if (filters.programId) query.set("programId", String(filters.programId));

  return useQuery({
    queryKey: ["followups", "queue", filters],
    queryFn: () => apiRequestPaginated<QueueRow>(`/api/followups/queue?${query.toString()}`),
  });
}

export function useFollowUpAttempts(studentId: number | undefined) {
  return useQuery({
    queryKey: ["students", studentId, "followups"],
    queryFn: () =>
      apiRequest<{ followUpAttempts: FollowUpAttempt[] }>(
        `/api/followups/students/${studentId}/follow-ups`,
      ).then((r) => r.followUpAttempts),
    enabled: studentId !== undefined,
  });
}

export function useCreateFollowUpAttempt(studentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFollowUpAttemptInput) =>
      apiRequest<{ followUpAttempt: FollowUpAttempt }>(
        `/api/followups/students/${studentId}/follow-ups`,
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students", studentId, "followups"] });
      queryClient.invalidateQueries({ queryKey: ["followups", "queue"] });
    },
  });
}
