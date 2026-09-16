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

async function rawRequest(
  path: string,
  init?: RequestInit,
): Promise<{ data: unknown; meta?: { pagination: Pagination } }> {
  const isFormData = init?.body instanceof FormData;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      // Letting the browser set Content-Type (with the multipart boundary) for
      // FormData bodies — evidence uploads go through this path.
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
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
 * first and hand the browser a blob: URL instead.
 */
export async function apiRequestBlob(path: string): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });

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
export async function downloadFile(path: string, filename: string): Promise<void> {
  const blob = await apiRequestBlob(path);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
