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
  /** False lists every accessible student. Anything else is the unresolved-outcome worklist. */
  needsOutcome?: boolean;
  page?: number;
  sort?: string;
  order?: "asc" | "desc";
}

export function useFollowUpQueue(filters: QueueFilters = {}) {
  const query = new URLSearchParams({ pageSize: "50", page: String(filters.page || 1) });
  if (filters.needsOutcome !== false) query.set("needsOutcome", "true");
  if (filters.minDaysOverdue) query.set("minDaysOverdue", String(filters.minDaysOverdue));
  if (filters.programId) query.set("programId", String(filters.programId));
  if (filters.sort) query.set("sort", filters.sort);
  if (filters.order) query.set("order", filters.order);

  return useQuery({
    queryKey: ["followups", "queue", filters],
    queryFn: () => apiRequestPaginated<QueueRow>(`/api/followups/queue?${query.toString()}`),
    placeholderData: (previousData) => previousData,
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

export interface BulkCreateFollowUpAttemptInput {
  studentIds: number[];
  attemptedAt: string;
  method: FollowUpMethod;
  outcome: FollowUpOutcome;
  notes?: string;
  nextFollowUpDate?: string;
}

export interface BulkCreateFollowUpAttemptResult {
  createdCount: number;
  skipped: { studentId: number; reason: string }[];
}

export function useBulkCreateFollowUpAttempts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkCreateFollowUpAttemptInput) =>
      apiRequest<BulkCreateFollowUpAttemptResult>("/api/followups/bulk", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["followups", "queue"] });
      for (const studentId of variables.studentIds) {
        queryClient.invalidateQueries({
          queryKey: ["students", studentId, "communication-timeline"],
        });
      }
    },
  });
}

export function useAssignFollowUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, staffUserId }: { studentId: number; staffUserId: number | null }) =>
      apiRequest<{ student: { id: number; assignedStaffUser: { id: number; name: string } | null } }>(
        `/api/followups/${studentId}/assign`,
        { method: "PATCH", body: JSON.stringify({ staffUserId }) },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["followups", "queue"] }),
  });
}

export interface BulkAssignFollowUpInput {
  studentIds: number[];
  staffUserId: number | null;
}

export interface BulkAssignFollowUpResult {
  assignedCount: number;
  skipped: { studentId: number; reason: string }[];
}

export function useBulkAssignFollowUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkAssignFollowUpInput) =>
      apiRequest<BulkAssignFollowUpResult>("/api/followups/assign/bulk", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["followups", "queue"] }),
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
      queryClient.invalidateQueries({
        queryKey: ["students", studentId, "communication-timeline"],
      });
    },
  });
}
