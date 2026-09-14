import { Alert } from "@mantine/core";
import type { Role } from "@outcomelink/shared";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();

  if (!user || !roles.includes(user.role)) {
    return (
      <Alert color="red" title="Access denied" m="xl">
        You don't have permission to view this page.
      </Alert>
    );
  }

  return children;
}
