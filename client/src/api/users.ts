import type { Role } from "@outcomelink/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/apiClient";
<<<<<<< HEAD
=======
import type { EmailResult } from "../lib/emailStatus";
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a

export interface StaffUser {
  id: number;
  name: string;
  role: Role;
  email?: string;
  active?: boolean;
  programIds?: number[];
  campusIds?: number[];
}

export function useUsers(options: { includeInactive?: boolean } = {}) {
  const query = options.includeInactive ? "?includeInactive=true" : "";
  return useQuery({
    queryKey: ["users", options],
    queryFn: () => apiRequest<{ users: StaffUser[] }>(`/api/users${query}`).then((r) => r.users),
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
<<<<<<< HEAD
      apiRequest<{ user: StaffUser; token: string }>("/api/users/invite", {
=======
      apiRequest<{ user: StaffUser; token?: string } & EmailResult>("/api/users/invite", {
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
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
<<<<<<< HEAD
      apiRequest<{ user: StaffUser }>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
=======
      apiRequest<{ user: StaffUser }>(`/api/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
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
<<<<<<< HEAD
    mutationFn: () => apiRequest<{ token: string }>(`/api/users/${id}/reset-password`, { method: "POST" }),
=======
    mutationFn: () =>
      apiRequest<{ token?: string } & EmailResult>(`/api/users/${id}/reset-password`, {
        method: "POST",
      }),
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
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
<<<<<<< HEAD
      apiRequest<SetUserAccessInput>(`/api/users/${id}/access`, { method: "PUT", body: JSON.stringify(input) }),
=======
      apiRequest<SetUserAccessInput>(`/api/users/${id}/access`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}
