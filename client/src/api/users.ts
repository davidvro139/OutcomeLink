import type { Role } from "@outcomelink/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/apiClient";

export interface StaffUser {
  id: number;
  name: string;
  role: Role;
  email?: string;
  active?: boolean;
  programIds?: number[];
  campusIds?: number[];
}

export interface PasswordLinkResult {
  token?: string;
  emailStatus: "SENT" | "FAILED" | "SKIPPED";
  emailReason?: string;
}

export function useUsers(
  options: {
    includeInactive?: boolean;
    sort?: string;
    order?: "asc" | "desc";
  } = {},
) {
  const query = new URLSearchParams();
  if (options.includeInactive) query.set("includeInactive", "true");
  if (options.sort) query.set("sort", options.sort);
  if (options.order) query.set("order", options.order);

  const queryString = query.toString();
  return useQuery({
    queryKey: ["users", options],
    queryFn: () =>
      apiRequest<{ users: StaffUser[] }>(`/api/users${queryString ? `?${queryString}` : ""}`).then(
        (r) => r.users,
      ),
  });
}

export interface InviteUserInput {
  name: string;
  email: string;
  role: Role;
}

export function useInviteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteUserInput) =>
      apiRequest<PasswordLinkResult & { user: StaffUser }>("/api/users/invite", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: Role;
}

export function useUpdateUser(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateUserInput) =>
      apiRequest<{ user: StaffUser }>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useSetUserActive(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (active: boolean) =>
      apiRequest<{ user: StaffUser }>(`/api/users/${id}/active`, {
        method: "PATCH",
        body: JSON.stringify({ active }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useResetUserPassword(id: number) {
  return useMutation({
    mutationFn: () => apiRequest<PasswordLinkResult>(`/api/users/${id}/reset-password`, { method: "POST" }),
  });
}

export interface SetUserAccessInput {
  programIds: number[];
  campusIds: number[];
}

export function useSetUserAccess(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetUserAccessInput) =>
      apiRequest<SetUserAccessInput>(`/api/users/${id}/access`, { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}
