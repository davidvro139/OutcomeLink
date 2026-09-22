import type { CplMetric } from "@outcomelink/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, apiRequestPaginated } from "../lib/apiClient";

export interface Campus {
  id: number;
  name: string;
  city: string | null;
  state: string | null;
}

export interface Department {
  id: number;
  name: string;
}

export interface Program {
  id: number;
  campusId: number;
  departmentId: number | null;
  name: string;
  code: string;
  cipCode: string | null;
  credentialType: string;
  programLength: string | null;
  clockHours: number | null;
  creditHours: number | null;
  licensureRequired: boolean;
  accreditationReportingStatus: string | null;
  active: boolean;
  effectiveStartDate: string | null;
  effectiveEndDate: string | null;
}

export interface CreateProgramInput {
  campusId: number;
  departmentId?: number;
  name: string;
  code: string;
  cipCode?: string;
  credentialType: string;
  programLength?: string;
  clockHours?: number;
  creditHours?: number;
  licensureRequired?: boolean;
}

export function useCampuses() {
  return useQuery({
    queryKey: ["campuses"],
    queryFn: () => apiRequestPaginated<Campus>("/api/campuses?pageSize=100"),
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: () => apiRequestPaginated<Department>("/api/departments?pageSize=100"),
  });
}

export function usePrograms(params: { campusId?: number; active?: boolean } = {}) {
  const query = new URLSearchParams({ pageSize: "100" });
  if (params.campusId) query.set("campusId", String(params.campusId));
  if (params.active !== undefined) query.set("active", String(params.active));

  return useQuery({
    queryKey: ["programs", params],
    queryFn: () => apiRequestPaginated<Program>(`/api/programs?${query.toString()}`),
  });
}

export function useProgram(id: number | undefined) {
  return useQuery({
    queryKey: ["programs", id],
    queryFn: () => apiRequest<{ program: Program }>(`/api/programs/${id}`).then((r) => r.program),
    enabled: id !== undefined,
  });
}

export function useCreateProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProgramInput) =>
      apiRequest<{ program: Program }>("/api/programs", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["programs"] }),
  });
}

export interface NegotiatedBenchmark {
  id: number;
  programId: number;
  metric: CplMetric;
  approvedPercentage: string;
  effectiveStartDate: string;
  effectiveEndDate: string | null;
  approvalReference: string;
  createdBy: string;
  createdAt: string;
}

export interface CreateNegotiatedBenchmarkInput {
  metric: CplMetric;
  approvedPercentage: number;
  effectiveStartDate: string;
  effectiveEndDate?: string;
  approvalReference: string;
}

export function useNegotiatedBenchmarks(programId: number | undefined) {
  return useQuery({
    queryKey: ["programs", programId, "negotiated-benchmarks"],
    queryFn: () =>
      apiRequest<{ negotiatedBenchmarks: NegotiatedBenchmark[] }>(
        `/api/programs/${programId}/negotiated-benchmarks`,
      ).then((r) => r.negotiatedBenchmarks),
    enabled: programId !== undefined,
  });
}

export function useCreateNegotiatedBenchmark(programId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateNegotiatedBenchmarkInput) =>
      apiRequest<{ negotiatedBenchmark: NegotiatedBenchmark }>(
        `/api/programs/${programId}/negotiated-benchmarks`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["programs", programId, "negotiated-benchmarks"] }),
  });
}

export interface ProgramFollowUpOwner {
  id: number;
  programId: number;
  staffUser: { id: number; name: string };
}

export function useProgramFollowUpOwner(programId: number | undefined) {
  return useQuery({
    queryKey: ["programs", programId, "follow-up-owner"],
    queryFn: () =>
      apiRequest<{ owner: ProgramFollowUpOwner | null }>(
        `/api/programs/${programId}/follow-up-owner`,
      ).then((r) => r.owner),
    enabled: programId !== undefined,
  });
}

export function useSetProgramFollowUpOwner(programId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (staffUserId: number) =>
      apiRequest<{ owner: ProgramFollowUpOwner }>(`/api/programs/${programId}/follow-up-owner`, {
        method: "PUT",
        body: JSON.stringify({ staffUserId }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["programs", programId, "follow-up-owner"] }),
  });
}

export function useRemoveProgramFollowUpOwner(programId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest(`/api/programs/${programId}/follow-up-owner`, { method: "DELETE" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["programs", programId, "follow-up-owner"] }),
  });
}
