import { Center, Loader } from "@mantine/core";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, sessionEndReason } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  if (status === "unauthenticated") {
    // Remember where the user was only when the session ran out from under
    // them; after an explicit sign-out the next login (possibly a different
    // person) should start at the dashboard, not resume the old route.
    const state = sessionEndReason === "logout" ? undefined : { from: location };
    return <Navigate to="/login" state={state} replace />;
  }

  return children;
}
