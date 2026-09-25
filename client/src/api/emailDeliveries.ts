import type { EmailDeliveryStatus, EmailPurpose } from "@outcomelink/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, apiRequestPaginated } from "../lib/apiClient";

export interface EmailDelivery {
  id: number;
  purpose: EmailPurpose;
  toAddress: string;
  subject: string;
  status: EmailDeliveryStatus;
  errorMessage: string | null;
  createdAt: string;
}

export interface EmailDeliveryFilters {
  status?: EmailDeliveryStatus;
  purpose?: EmailPurpose;
  page: number;
}

export function useEmailDeliveries(filters: EmailDeliveryFilters, enabled = true) {
  const query = new URLSearchParams({ pageSize: "25", page: String(filters.page) });
  if (filters.status) query.set("status", filters.status);
  if (filters.purpose) query.set("purpose", filters.purpose);
  return useQuery({
    queryKey: ["email-deliveries", filters],
    queryFn: () => apiRequestPaginated<EmailDelivery>(`/api/email-deliveries?${query.toString()}`),
    placeholderData: (previousData) => previousData,
    enabled,
  });
}

/** Whether the server is actually sending email (vs. showing copy-links). */
export function useEmailStatus() {
  return useQuery({
    queryKey: ["email-deliveries", "status"],
    queryFn: () => apiRequest<{ configured: boolean; source: "institution" | "server" | "none" }>("/api/email-deliveries/status"),
    staleTime: 5 * 60 * 1000,
  });
}

export function useEmailNotificationPreference() {
  return useQuery({
    queryKey: ["auth", "preferences"],
    queryFn: () =>
      apiRequest<{ preferences: { emailNotifications: boolean } }>("/api/auth/me/preferences").then(
        (r) => r.preferences,
      ),
  });
}

export function useSetEmailNotificationPreference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (emailNotifications: boolean) =>
      apiRequest<{ preferences: { emailNotifications: boolean } }>("/api/auth/me/preferences", {
        method: "PATCH",
        body: JSON.stringify({ emailNotifications }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth", "preferences"] }),
  });
}
