import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/apiClient";
import type { Employer } from "./employers";

export interface EmploymentRecord {
  id: number;
  studentId: number;
  employerId: number;
  jobTitle: string;
  startDate: string;
  endDate: string | null;
  fullTime: boolean;
  relatedToTraining: boolean;
  employmentStatus: string;
  verificationStatus: string | null;
  employer?: Employer;
}

export interface CreateEmploymentRecordInput {
  employerId: number;
  jobTitle: string;
  startDate: string;
  endDate?: string;
  fullTime: boolean;
  relatedToTraining: boolean;
  employmentStatus: string;
  verificationStatus?: string;
}

export function useEmploymentRecords(studentId: number | undefined) {
  return useQuery({
    queryKey: ["students", studentId, "employment"],
    queryFn: () =>
      apiRequest<{ employmentRecords: EmploymentRecord[] }>(
        `/api/students/${studentId}/employment`,
      ).then((r) => r.employmentRecords),
    enabled: studentId !== undefined,
  });
}

export function useCreateEmploymentRecord(studentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEmploymentRecordInput) =>
      apiRequest<{ employmentRecord: EmploymentRecord }>(`/api/students/${studentId}/employment`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["students", studentId, "employment"] }),
  });
}
