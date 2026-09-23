import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  const queryClient = useQueryClient();

  // Query keys carry no user/institution identity, so the shared cache would
  // otherwise hand the previous account's data to the next one in the same
  // tab (project review, 2026-09-18). Cleared in an effect keyed on identity
  // rather than inline in login/logout: it runs after the render that
  // unmounts the protected tree, so no mounted page can refetch into the
  // cache mid-clear, and it also covers a user change with no logout in
  // between (e.g. an expired session followed by a different login).
  // In-flight requests are cancelled at the call sites, before state changes,
  // so a late response can't repopulate the cache afterward.
  const userId = user?.id ?? null;
  const previousUserId = useRef<number | null>(null);
  useEffect(() => {
    // Only when leaving an identity that actually held data — not on the
    // null -> user transition, where child effects (already-mounted pages'
    // first queries) run before this parent effect and would be wiped.
    if (previousUserId.current !== null && previousUserId.current !== userId) {
      queryClient.clear();
    }
    previousUserId.current = userId;
  }, [userId, queryClient]);

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
    await queryClient.cancelQueries();
    setAccessToken(accessToken);
    setUser(loggedInUser);
    setStatus("authenticated");
  }, [queryClient]);

  const logout = useCallback(async () => {
    await apiRequest("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    await queryClient.cancelQueries();
    setAccessToken(null);
    setUser(null);
    setStatus("unauthenticated");
  }, [queryClient]);

  const value = useMemo(() => ({ user, status, login, logout }), [user, status, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
