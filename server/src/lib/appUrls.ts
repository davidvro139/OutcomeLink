import { env } from "../config/env";

/**
 * Absolute URL for a client route, for use in emails. The server has never
 * needed one before — the client builds every link from
 * `window.location.origin` — but an emailed link has no browser to ask.
 */
export function publicUrl(path: string): string {
  const base = (env.PUBLIC_APP_URL ?? env.CLIENT_ORIGIN).replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
