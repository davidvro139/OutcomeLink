import type { AllowableSubtractionReason, EnrollmentStatus } from "@outcomelink/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, apiRequestPaginated } from "../lib/apiClient";

export interface Student {
  id: number;
  internalStudentId: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
  communicationPreference?: CommunicationPreference | null;
}

export interface CommunicationPreference {
  id: number;
  studentId: number;
  preferredContactMethod: string | null;
  doNotContact: boolean;
  doNotContactReason: string | null;
}

export interface StudentEnrollment {
  id: number;
  studentId: number;
  programId: number;
  campusId: number;
  cohortId: number | null;
  startDate: string;
  expectedCompletionDate: string | null;
  actualCompletionDate: string | null;
  enrollmentStatus: EnrollmentStatus;
  credentialEarned: string | null;
  exitReason: string | null;
  allowableSubtractionReason: AllowableSubtractionReason | null;
}

export interface CreateStudentInput {
  internalStudentId: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  email?: string;
  phone?: string;
}

export interface CreateEnrollmentInput {
  programId: number;
  campusId: number;
  startDate: string;
  expectedCompletionDate?: string;
  actualCompletionDate?: string;
  enrollmentStatus: EnrollmentStatus;
  credentialEarned?: string;
  allowableSubtractionReason?: AllowableSubtractionReason | null;
}

export function useStudents(search?: string, page = 1) {
  const query = new URLSearchParams({ pageSize: "50", page: String(page) });
  if (search) query.set("search", search);

  return useQuery({
    queryKey: ["students", search, page],
    queryFn: () => apiRequestPaginated<Student>(`/api/students?${query.toString()}`),
    placeholderData: (previousData) => previousData,
  });
}

export function useStudent(id: number | undefined) {
  return useQuery({
    queryKey: ["students", id],
    queryFn: () => apiRequest<{ student: Student }>(`/api/students/${id}`).then((r) => r.student),
    enabled: id !== undefined,
  });
}

export function useCreateStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStudentInput) =>
      apiRequest<{ student: Student }>("/api/students", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["students"] }),
  });
}

export function useEnrollments(studentId: number | undefined) {
  return useQuery({
    queryKey: ["students", studentId, "enrollments"],
    queryFn: () =>
      apiRequest<{ enrollments: StudentEnrollment[] }>(
        `/api/students/${studentId}/enrollments`,
      ).then((r) => r.enrollments),
    enabled: studentId !== undefined,
  });
}

export function useCreateEnrollment(studentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEnrollmentInput) =>
      apiRequest<{ enrollment: StudentEnrollment }>(`/api/students/${studentId}/enrollments`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["students", studentId, "enrollments"] }),
  });
}

export function useUpdateEnrollment(studentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<CreateEnrollmentInput> }) =>
      apiRequest<{ enrollment: StudentEnrollment }>(
        `/api/students/${studentId}/enrollments/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify(input),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students", studentId, "enrollments"] });
    },
  });
}

export function useUpsertCommunicationPreference(studentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      doNotContact: boolean;
      doNotContactReason?: string;
      preferredContactMethod?: string;
    }) =>
      apiRequest<{ preference: CommunicationPreference }>(
        `/api/students/${studentId}/communication-preference`,
        {
          method: "PUT",
          body: JSON.stringify(input),
        },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["students", studentId] }),
  });
}

export function useMergeStudent(survivingStudentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { mergedStudentId: number; reason: string }) =>
      apiRequest(`/api/students/${survivingStudentId}/merge`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["students"] }),
  });
}
