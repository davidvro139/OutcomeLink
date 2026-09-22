import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, apiRequestPaginated } from "../lib/apiClient";

export interface Employer {
  id: number;
  name: string;
  industry: string | null;
  naicsCode: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  active: boolean;
  contacts?: EmployerContact[];
}

export interface EmployerContact {
  id: number;
  employerId: number;
  name: string;
  title: string | null;
  phone: string | null;
  email: string | null;
  isPrimaryContact: boolean;
  isVerificationContact: boolean;
}

export interface CreateEmployerInput {
  name: string;
  industry?: string;
  naicsCode?: string;
  city?: string;
  state?: string;
  website?: string;
}

export interface CreateContactInput {
  name: string;
  title?: string;
  phone?: string;
  email?: string;
  isPrimaryContact?: boolean;
  isVerificationContact?: boolean;
}

export function useEmployers(search?: string, page = 1) {
  const query = new URLSearchParams({ pageSize: "50", page: String(page) });
  if (search) query.set("search", search);

  return useQuery({
    queryKey: ["employers", search, page],
    queryFn: () => apiRequestPaginated<Employer>(`/api/employers?${query.toString()}`),
    placeholderData: (previousData) => previousData,
  });
}

export function useEmployer(id: number | undefined) {
  return useQuery({
    queryKey: ["employers", id],
    queryFn: () =>
      apiRequest<{ employer: Employer }>(`/api/employers/${id}`).then((r) => r.employer),
    enabled: id !== undefined,
  });
}

export function useUpdateEmployerLocation(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (location: { city: string; state: string }) =>
      apiRequest(`/api/employers/${id}`, { method: "PATCH", body: JSON.stringify(location) }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employers"] }),
        queryClient.invalidateQueries({ queryKey: ["reports", "geographic-placements"] }),
      ]);
    },
  });
}

export function useCreateEmployer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEmployerInput) =>
      apiRequest<{ employer: Employer }>("/api/employers", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["employers"] }),
  });
}

export interface EmployerAnalyticsRow {
  employer: { id: number; name: string; industry: string | null };
  placementCount: number;
  relatedPlacementCount: number;
}

export interface IndustryBreakdownRow {
  industry: string;
  placementCount: number;
  employerCount: number;
}

export interface EmployerConcentration {
  totalPlacements: number;
  distinctEmployerCount: number;
  topEmployerShare: number;
  top5Share: number;
  risk: "LOW" | "MODERATE" | "HIGH";
}

export function useEmployerAnalytics(reportingPeriodId: number | undefined) {
  const query = new URLSearchParams();
  if (reportingPeriodId) query.set("reportingPeriodId", String(reportingPeriodId));

  return useQuery({
    queryKey: ["employers", "analytics", reportingPeriodId],
    queryFn: () =>
      apiRequest<{
        topEmployers: EmployerAnalyticsRow[];
        industryBreakdown: IndustryBreakdownRow[];
        concentration: EmployerConcentration;
      }>(`/api/employers/analytics?${query.toString()}`),
  });
}

export function useCreateContact(employerId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateContactInput) =>
      apiRequest<{ contact: EmployerContact }>(`/api/employers/${employerId}/contacts`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["employers", employerId] }),
  });
}
