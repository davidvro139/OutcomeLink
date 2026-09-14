const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export class ApiRequestError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.details = details;
  }
}

// Holds the short-lived access token in memory only — never localStorage — since
// the refresh token that actually restores a session lives in an httpOnly cookie
// the JS layer can't (and shouldn't) touch directly. See auth/AuthProvider.tsx.
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Thin fetch wrapper matching the server's { data } / { error } envelope (spec §59). */
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
    ...init,
  });

  const body = await response.json().catch(() => undefined);

  if (!response.ok) {
    const message = body?.error?.message ?? response.statusText;
    throw new ApiRequestError(response.status, message, body?.error?.details);
  }

  return body.data as T;
}
