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

/** Thin fetch wrapper matching the server's { data } / { error } envelope (spec §59). */
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });

  const body = await response.json().catch(() => undefined);

  if (!response.ok) {
    const message = body?.error?.message ?? response.statusText;
    throw new ApiRequestError(response.status, message, body?.error?.details);
  }

  return body.data as T;
}
