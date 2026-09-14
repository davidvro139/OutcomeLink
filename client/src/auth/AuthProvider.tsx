import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiRequest, setAccessToken } from "../lib/apiClient";
import { AuthContext, type AuthStatus, type AuthUser } from "./AuthContext";

/**
 * On mount, attempts a silent refresh using the httpOnly refresh cookie —
 * this is what lets a page reload restore the session without forcing a
 * fresh login every time (spec §57's "silent token refresh").
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { accessToken } = await apiRequest<{ accessToken: string }>("/api/auth/refresh", {
          method: "POST",
        });
        setAccessToken(accessToken);
        const { user: me } = await apiRequest<{ user: AuthUser }>("/api/auth/me");
        if (!cancelled) {
          setUser(me);
          setStatus("authenticated");
        }
      } catch {
        if (!cancelled) {
          setAccessToken(null);
          setUser(null);
          setStatus("unauthenticated");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: loggedInUser, accessToken } = await apiRequest<{
      user: AuthUser;
      accessToken: string;
    }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    setAccessToken(accessToken);
    setUser(loggedInUser);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    await apiRequest("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setAccessToken(null);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo(() => ({ user, status, login, logout }), [user, status, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
