import { createContext, useContext } from "react";
import type { Role } from "@outcomelink/shared";

export interface AuthUser {
  id: number;
  institutionId: number;
  name: string;
  email: string;
  role: Role;
}

/** Why the last session ended — an expiry should return you to where you were; an explicit sign-out should not. */
export type SessionEndReason = "logout" | "expired" | null;

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  sessionEndReason: SessionEndReason;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
