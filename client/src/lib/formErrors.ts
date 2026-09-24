import { ApiRequestError } from "./apiClient";

/**
 * A readable message for a failed save. The API's validation errors carry the
 * per-field messages ("Enter a host name such as smtp.example.com…") in
 * `details.fieldErrors`; show those instead of the generic "Request validation failed".
 */
export function describeSaveError(err: unknown, fallback = "Failed to save"): string {
  if (err instanceof ApiRequestError) {
    const fieldErrors = (
      err.details as { fieldErrors?: Record<string, string[] | undefined> } | undefined
    )?.fieldErrors;
    const messages = Object.values(fieldErrors ?? {}).flatMap((m) => m ?? []);
    if (messages.length > 0) return messages.join(" ");
    return err.message;
  }
  return err instanceof Error ? err.message : fallback;
}
