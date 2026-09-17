import type {
  ContinuingEducationStatus,
  EmployerVerificationResponse,
  EmploymentStatus,
  GraduateRelatedToTrainingResponse,
} from "@outcomelink/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/apiClient";

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
      apiRequest<{ survey: GraduateSurvey }>(`/api/students/${studentId}/graduate-surveys`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students", studentId, "graduate-surveys"] });
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
    mutationFn: (input: { employerId: number }) =>
      apiRequest<{ survey: EmployerSurvey }>(`/api/students/${studentId}/employer-surveys`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students", studentId, "employer-surveys"] });
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
