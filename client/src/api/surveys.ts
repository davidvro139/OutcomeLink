import type {
  ContinuingEducationStatus,
  EmployerVerificationResponse,
  EmploymentStatus,
  GraduateRelatedToTrainingResponse,
} from "@outcomelink/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/apiClient";
<<<<<<< HEAD
=======
import type { EmailResult } from "../lib/emailStatus";
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a

export interface GraduateSurveyResponse {
  id: number;
  surveyId: number;
  employmentStatus: EmploymentStatus | null;
  employer: string | null;
  jobTitle: string | null;
  relatedToTrainingResponse: GraduateRelatedToTrainingResponse | null;
  continuingEducation: ContinuingEducationStatus | null;
  satisfactionRating: number | null;
  skillsPreparednessRating: number | null;
  comments: string | null;
  submittedAt: string;
}

export interface GraduateSurvey {
  id: number;
  studentId: number;
  sentAt: string;
  channel: string | null;
  responseToken: string;
  response: GraduateSurveyResponse | null;
}

export interface EmployerSurveyResponseData {
  id: number;
  surveyId: number;
  employmentVerification: EmployerVerificationResponse | null;
  technicalPreparednessRating: number | null;
  communicationRating: number | null;
  problemSolvingRating: number | null;
  professionalismRating: number | null;
  overallSatisfactionRating: number | null;
  skillsGapNotes: string | null;
  likelihoodToHireAgainRating: number | null;
  comments: string | null;
  submittedAt: string;
}

export interface EmployerSurvey {
  id: number;
  studentId: number;
  employerId: number;
  sentAt: string;
  responseToken: string;
  employer: { id: number; name: string };
  response: EmployerSurveyResponseData | null;
}

export function useGraduateSurveys(studentId: number | undefined) {
  return useQuery({
    queryKey: ["students", studentId, "graduate-surveys"],
    queryFn: () =>
      apiRequest<{ surveys: GraduateSurvey[] }>(`/api/students/${studentId}/graduate-surveys`).then(
        (r) => r.surveys,
      ),
    enabled: studentId !== undefined,
  });
}

export function useSendGraduateSurvey(studentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { channel?: string }) =>
<<<<<<< HEAD
      apiRequest<{ survey: GraduateSurvey }>(`/api/students/${studentId}/graduate-surveys`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
=======
      apiRequest<{ survey: GraduateSurvey } & EmailResult>(
        `/api/students/${studentId}/graduate-surveys`,
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      ),
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students", studentId, "graduate-surveys"] });
      queryClient.invalidateQueries({
        queryKey: ["students", studentId, "communication-timeline"],
      });
    },
  });
}

export function useEmployerSurveys(studentId: number | undefined) {
  return useQuery({
    queryKey: ["students", studentId, "employer-surveys"],
    queryFn: () =>
      apiRequest<{ surveys: EmployerSurvey[] }>(`/api/students/${studentId}/employer-surveys`).then(
        (r) => r.surveys,
      ),
    enabled: studentId !== undefined,
  });
}

export function useSendEmployerSurvey(studentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
<<<<<<< HEAD
    mutationFn: (input: { employerId: number }) =>
      apiRequest<{ survey: EmployerSurvey }>(`/api/students/${studentId}/employer-surveys`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
=======
    mutationFn: (input: { employerId: number; employerContactId?: number; sendEmail?: boolean }) =>
      apiRequest<{ survey: EmployerSurvey } & EmailResult>(
        `/api/students/${studentId}/employer-surveys`,
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      ),
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students", studentId, "employer-surveys"] });
      queryClient.invalidateQueries({
        queryKey: ["students", studentId, "communication-timeline"],
      });
    },
  });
}

export interface PublicGraduateSurveyInfo {
  studentFirstName: string;
  studentLastName: string;
  alreadyResponded: boolean;
}

export function usePublicGraduateSurvey(token: string | undefined) {
  return useQuery({
    queryKey: ["public-surveys", "graduate", token],
    queryFn: () => apiRequest<PublicGraduateSurveyInfo>(`/api/public/surveys/graduate/${token}`),
    enabled: token !== undefined,
    retry: false,
  });
}

export interface SubmitGraduateSurveyResponseInput {
  employmentStatus?: EmploymentStatus;
  employer?: string;
  jobTitle?: string;
  relatedToTrainingResponse?: GraduateRelatedToTrainingResponse;
  continuingEducation?: ContinuingEducationStatus;
  satisfactionRating?: number;
  skillsPreparednessRating?: number;
  comments?: string;
}

export function useSubmitGraduateSurveyResponse(token: string) {
  return useMutation({
    mutationFn: (input: SubmitGraduateSurveyResponseInput) =>
      apiRequest(`/api/public/surveys/graduate/${token}/response`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}

export interface PublicEmployerSurveyInfo {
  studentFirstName: string;
  studentLastName: string;
  employerName: string;
  alreadyResponded: boolean;
}

export function usePublicEmployerSurvey(token: string | undefined) {
  return useQuery({
    queryKey: ["public-surveys", "employer", token],
    queryFn: () => apiRequest<PublicEmployerSurveyInfo>(`/api/public/surveys/employer/${token}`),
    enabled: token !== undefined,
    retry: false,
  });
}

export interface SubmitEmployerSurveyResponseInput {
  employmentVerification?: EmployerVerificationResponse;
  technicalPreparednessRating?: number;
  communicationRating?: number;
  problemSolvingRating?: number;
  professionalismRating?: number;
  overallSatisfactionRating?: number;
  skillsGapNotes?: string;
  likelihoodToHireAgainRating?: number;
  comments?: string;
}

export function useSubmitEmployerSurveyResponse(token: string) {
  return useMutation({
    mutationFn: (input: SubmitEmployerSurveyResponseInput) =>
      apiRequest(`/api/public/surveys/employer/${token}/response`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}

export interface GraduateCampaignResult {
  targetedCount: number;
  sentCount: number;
<<<<<<< HEAD
=======
  emailedCount: number;
  failedCount: number;
  resentCount: number;
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
  skipped: { studentId: number; reason: string }[];
}

/** Deferred item (docs/TODO.md): batched graduate-survey outreach to everyone this period with no resolved outcome yet. */
export function useStartGraduateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { reportingPeriodId: number; channel?: string }) =>
      apiRequest<GraduateCampaignResult>("/api/surveys/graduate-campaign", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["reports", "unknown-outcomes", variables.reportingPeriodId],
      });
    },
  });
}
