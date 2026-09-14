import type {
  AvailabilityStatus,
  ContinuingEducationStatus,
  EmploymentStatus,
  MilitaryStatus,
} from "@outcomelink/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/apiClient";

export interface OutcomeRecord {
  id: number;
  studentEnrollmentId: number;
  reportingPeriodId: number;
  employmentStatus: EmploymentStatus | null;
  employerId: number | null;
  jobTitle: string | null;
  relatedToTraining: boolean | null;
  relatedToTrainingJustification: string | null;
  continuingEducationStatus: ContinuingEducationStatus | null;
  militaryStatus: MilitaryStatus | null;
  availabilityForEmploymentStatus: AvailabilityStatus | null;
  licensureRequired: boolean;
  verificationStatus: string | null;
}

export interface CreateOutcomeRecordInput {
  reportingPeriodId: number;
  employmentStatus?: EmploymentStatus;
  employerId?: number;
  relatedToTraining?: boolean;
  relatedToTrainingJustification?: string;
  continuingEducationStatus?: ContinuingEducationStatus;
  militaryStatus?: MilitaryStatus;
  availabilityForEmploymentStatus?: AvailabilityStatus;
  licensureRequired?: boolean;
  verificationStatus?: string;
}

export function useOutcomeRecords(studentId: number | undefined, enrollmentId: number | undefined) {
  return useQuery({
    queryKey: ["students", studentId, "enrollments", enrollmentId, "outcomes"],
    queryFn: () =>
      apiRequest<{ outcomeRecords: OutcomeRecord[] }>(
        `/api/students/${studentId}/enrollments/${enrollmentId}/outcomes`,
      ).then((r) => r.outcomeRecords),
    enabled: studentId !== undefined && enrollmentId !== undefined,
  });
}

export function useCreateOutcomeRecord(studentId: number, enrollmentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOutcomeRecordInput) =>
      apiRequest<{ outcomeRecord: OutcomeRecord }>(
        `/api/students/${studentId}/enrollments/${enrollmentId}/outcomes`,
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["students", studentId, "enrollments", enrollmentId, "outcomes"],
      }),
  });
}
