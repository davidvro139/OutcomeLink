import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/apiClient";

export interface Notification {
  id: number;
  userId: number;
  type: string;
  message: string;
  referenceEntityType: string | null;
  referenceEntityId: number | null;
  createdAt: string;
  readAt: string | null;
}

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () =>
      apiRequest<{ notifications: Notification[]; unreadCount: number }>("/api/notifications"),
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<{ notification: Notification }>(`/api/notifications/${id}/read`, {
        method: "PATCH",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest("/api/notifications/read-all", { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export interface MissingOutcomesDigestResult {
  recipientCount: number;
  unresolvedCount: number;
}

/** Deferred item (docs/TODO.md): pushes a MISSING_OUTCOMES_DIGEST notification to every operational-role staff member. */
export function useGenerateMissingOutcomesDigest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reportingPeriodId: number) =>
      apiRequest<MissingOutcomesDigestResult>("/api/notifications/missing-outcomes-digest", {
        method: "POST",
        body: JSON.stringify({ reportingPeriodId }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
