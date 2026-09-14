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
