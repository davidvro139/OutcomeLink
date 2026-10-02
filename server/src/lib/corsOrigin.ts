const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Whether a browser Origin may read credentialed API responses.
 *
 * Production allows only CLIENT_ORIGIN. Development also allows any port on
 * localhost, 127.0.0.1, and ::1: Vite moves to 5174, 5175, and so on when
 * 5173 is already taken, and a mismatched Origin makes the browser throw
 * before the login page can show the API's own error.
 * Requests with no Origin are not cross-origin (curl, server-side tests).
 */
export function isAllowedCorsOrigin(
  requestOrigin: string | undefined,
  clientOrigin: string,
  nodeEnv: string,
): boolean {
  if (!requestOrigin) return true;
  if (requestOrigin === clientOrigin) return true;
  if (nodeEnv !== "development") return false;

  try {
    const url = new URL(requestOrigin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    // Node reports the IPv6 hostname with brackets (`[::1]`).
    const host = url.hostname.replace(/^\[|\]$/g, "");
    return LOOPBACK_HOSTS.has(host);
  } catch {
    return false;
  }
}
