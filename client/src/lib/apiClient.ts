import type { Pagination } from "../api/types";

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

let onSessionExpired: (() => void) | null = null;

/** Registered by AuthProvider so an unrecoverable 401 can end the UI session. */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

// One refresh at a time: a page fires many parallel queries, and when the
// access token has expired they all 401 together — each starting its own
// refresh would race on the rotating refresh cookie.
let refreshInFlight: Promise<boolean> | null = null;

function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) return false;
      const body = await response.json();
      accessToken = body.data.accessToken;
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/**
 * Every authenticated request goes through here so an expired access token
 * (15m TTL; refresh previously ran only once, on mount) is refreshed and the
 * request retried once instead of failing while the UI still looks logged in
 * (project review, 2026-09-18). Auth endpoints themselves are excluded — a
 * 401 from login means bad credentials, not an expired session — as are
 * requests that never carried a token (public survey/set-password pages). If
 * the refresh fails the session is over: notify AuthProvider and surface the
 * original 401.
 */
async function authedFetch(path: string, buildInit: () => RequestInit): Promise<Response> {
  const sentToken = accessToken !== null;
  const send = () => fetch(`${API_BASE_URL}${path}`, buildInit());

  const response = await send();
  if (response.status !== 401 || !sentToken || path.startsWith("/api/auth/")) return response;

  if (await refreshAccessToken()) return send();
  accessToken = null;
  onSessionExpired?.();
  return response;
}

async function rawRequest(
  path: string,
  init?: RequestInit,
): Promise<{ data: unknown; meta?: { pagination: Pagination } }> {
  const isFormData = init?.body instanceof FormData;

  const response = await authedFetch(path, () => ({
    credentials: "include",
    headers: {
      // Letting the browser set Content-Type (with the multipart boundary) for
      // FormData bodies — evidence uploads go through this path.
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
    ...init,
  }));

  const body = await response.json().catch(() => undefined);

  if (!response.ok) {
    const message = body?.error?.message ?? response.statusText;
    throw new ApiRequestError(response.status, message, body?.error?.details);
  }

  return body ?? { data: undefined };
}

/** Thin fetch wrapper matching the server's { data } / { error } envelope (spec §59). */
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await rawRequest(path, init);
  return data as T;
}

/** For list endpoints that return { data: T[], meta: { pagination } }. */
export async function apiRequestPaginated<T>(
  path: string,
  init?: RequestInit,
): Promise<{ items: T[]; pagination: Pagination }> {
  const { data, meta } = await rawRequest(path, init);
  return { items: (data as T[]) ?? [], pagination: meta!.pagination };
}

/**
 * For binary responses (evidence file download) that don't use the { data }
 * envelope. A plain <a href> or window.open to an authenticated route won't
 * carry the Authorization header, so the caller must fetch the bytes here
 * first and hand the browser a blob: URL instead. Accepts an optional
 * `init` for exports that need a POST body (e.g. the Custom Report
 * Builder's arbitrary field/filter selection) rather than a plain GET.
 */
export async function apiRequestBlob(path: string, init?: RequestInit): Promise<Blob> {
<<<<<<< HEAD
  const response = await fetch(`${API_BASE_URL}${path}`, {
=======
  const response = await authedFetch(path, () => ({
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
    ...init,
<<<<<<< HEAD
  });
=======
  }));
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a

  if (!response.ok) {
    throw new ApiRequestError(response.status, response.statusText);
  }

  return response.blob();
}

/**
 * Fetches a file (e.g. an Excel export) with the Authorization header
 * attached, then prompts the browser to save it under the given filename —
 * a plain <a href> to an authenticated route can't carry that header, same
 * reasoning as apiRequestBlob above, but this one triggers a save rather
 * than opening the file inline.
 */
export async function downloadFile(path: string, filename: string, init?: RequestInit): Promise<void> {
  const blob = await apiRequestBlob(path, init);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
