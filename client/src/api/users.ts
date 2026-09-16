import type { Role } from "@outcomelink/shared";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/apiClient";

export interface StaffUser {
  id: number;
  name: string;
  role: Role;
}

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => apiRequest<{ users: StaffUser[] }>("/api/users").then((r) => r.users),
  });
}
