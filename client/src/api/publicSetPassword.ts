import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/apiClient";

export interface SetPasswordInfo {
  name: string;
  email: string;
}

/** Unauthenticated — same reasoning as the public survey endpoints: the token in the URL is the access control, not a session. */
export function useSetPasswordInfo(token: string | undefined) {
  return useQuery({
    queryKey: ["public", "set-password", token],
    queryFn: () => apiRequest<SetPasswordInfo>(`/api/public/set-password/${token}`),
    enabled: token !== undefined,
    retry: false,
  });
}

export function useCompleteSetPassword(token: string) {
  return useMutation({
    mutationFn: (password: string) =>
      apiRequest<{ email: string }>(`/api/public/set-password/${token}`, {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
  });
}
