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

export function useEmployers(search?: string) {
  const query = new URLSearchParams({ pageSize: "50" });
  if (search) query.set("search", search);

  return useQuery({
    queryKey: ["employers", search],
    queryFn: () => apiRequestPaginated<Employer>(`/api/employers?${query.toString()}`),
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
