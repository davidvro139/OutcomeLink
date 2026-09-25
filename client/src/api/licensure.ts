import type { LicensureResultStatus } from "@outcomelink/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
<<<<<<< HEAD
import { apiRequest } from "../lib/apiClient";
=======
import { apiRequest, apiRequestPaginated } from "../lib/apiClient";
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a

export interface LicensureResult {
  id: number;
  studentId: number;
  programId: number;
  examName: string;
  scheduledDate: string | null;
  examDate: string | null;
  result: LicensureResultStatus;
  attemptNumber: number;
  program?: { id: number; name: string };
}

export interface CreateLicensureResultInput {
  programId: number;
  examName: string;
  scheduledDate?: string;
  examDate?: string;
  result: LicensureResultStatus;
  attemptNumber?: number;
}

export interface LicensureQueueRow {
  student: { id: number; firstName: string; lastName: string };
  program: { id: number; name: string };
  completionDate: string | null;
  latestResult: {
    id: number;
    examName: string;
    result: LicensureResultStatus;
    scheduledDate: string | null;
    examDate: string | null;
    attemptNumber: number;
  } | null;
}

export function useLicensureResults(studentId: number | undefined) {
  return useQuery({
    queryKey: ["students", studentId, "licensure-results"],
    queryFn: () =>
      apiRequest<{ licensureResults: LicensureResult[] }>(
        `/api/students/${studentId}/licensure-results`,
      ).then((r) => r.licensureResults),
    enabled: studentId !== undefined,
  });
}

export function useCreateLicensureResult(studentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLicensureResultInput) =>
      apiRequest<{ licensureResult: LicensureResult }>(
        `/api/students/${studentId}/licensure-results`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students", studentId, "licensure-results"] });
      queryClient.invalidateQueries({ queryKey: ["licensure", "queue"] });
    },
  });
}

export function useUpdateLicensureResult(studentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<CreateLicensureResultInput> }) =>
      apiRequest<{ licensureResult: LicensureResult }>(
        `/api/students/${studentId}/licensure-results/${id}`,
        { method: "PATCH", body: JSON.stringify(input) },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students", studentId, "licensure-results"] });
      queryClient.invalidateQueries({ queryKey: ["licensure", "queue"] });
    },
  });
}

<<<<<<< HEAD
export function useLicensureQueue() {
  return useQuery({
    queryKey: ["licensure", "queue"],
    queryFn: () =>
      apiRequest<{ queue: LicensureQueueRow[] }>("/api/licensure/queue").then((r) => r.queue),
=======
export function useLicensureQueue(page = 1) {
  return useQuery({
    queryKey: ["licensure", "queue", page],
    queryFn: () =>
      apiRequestPaginated<LicensureQueueRow>(`/api/licensure/queue?page=${page}&pageSize=50`),
    placeholderData: (previousData) => previousData,
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
  });
}
