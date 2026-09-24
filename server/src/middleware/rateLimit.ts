import type { NextFunction, Request, Response } from "express";
import rateLimit, { ipKeyGenerator, MemoryStore, type Options } from "express-rate-limit";
import { env } from "../config/env";
import { ApiError } from "../lib/apiError";

/**
 * Rate limiting for the routes an anonymous caller can reach (login,
 * registration, token refresh, set-password, public survey links) plus a
 * generous blanket limit on the whole API (docs/TODO.md "Login rate limiting
 * and security headers"). Counters live in this process's memory: right for
 * the single-instance deployment this app runs as today, and something to
 * swap for a shared store (Redis) before running several instances behind a
 * load balancer, since each instance would otherwise count separately.
 *
 * Off under NODE_ENV=test — the integration suites make hundreds of requests
 * from one address — unless a test switches it on for the limiter under test.
 */
let enabled = env.NODE_ENV !== "test";
const stores: MemoryStore[] = [];

export function setRateLimitingForTests(on: boolean): void {
  enabled = on;
}

/** Clears every counter, so one test's requests can't count against the next. */
export function resetRateLimits(): void {
  for (const store of stores) store.resetAll();
}

interface LimiterOptions {
  windowMs: number;
  limit: number;
  message: string;
  /** Count only responses that were errors (4xx/5xx) — a login limiter that shouldn't punish successful sign-ins. */
  onlyFailures?: boolean;
  keyGenerator?: Options["keyGenerator"];
}

function limiter(options: LimiterOptions) {
  const store = new MemoryStore();
  stores.push(store);
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    store,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => !enabled,
    skipSuccessfulRequests: options.onlyFailures ?? false,
    keyGenerator: options.keyGenerator,
    handler: (req: Request, _res: Response, next: NextFunction) => {
      const resetTime = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit
        ?.resetTime;
      const minutes = resetTime
        ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 60_000))
        : undefined;
      next(
        new ApiError(
          429,
          "RATE_LIMITED",
          minutes
            ? `${options.message} Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`
            : options.message,
        ),
      );
    },
  });
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const clientIp = (req: Request) => ipKeyGenerator(req.ip ?? "unknown");

/** Blanket ceiling on the whole API, per address — far above real use, there to stop scripted floods. */
export const apiLimiter = limiter({ windowMs: MINUTE, limit: 1000, message: "Too many requests." });

/**
 * Failed sign-ins only, and keyed on address + email so guessing one account's
 * password from one place is capped without letting an attacker lock a real
 * user out from everywhere (which a per-email-only key would allow).
 */
export const loginAccountLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  message: "Too many failed sign-in attempts for this account.",
  onlyFailures: true,
  keyGenerator: (req) =>
    `${clientIp(req)}|${String((req.body as { email?: unknown } | undefined)?.email ?? "").toLowerCase()}`,
});

/** Failed sign-ins from one address across all accounts — catches one client trying many usernames. */
export const loginAddressLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 50,
  message: "Too many failed sign-in attempts.",
  onlyFailures: true,
  keyGenerator: clientIp,
});

/** Creating a brand-new institution is rare; a handful an hour per address is plenty. */
export const registerLimiter = limiter({
  windowMs: HOUR,
  limit: 5,
  message: "Too many registrations from this address.",
  keyGenerator: clientIp,
});

export const refreshLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 100,
  message: "Too many session refresh attempts.",
  keyGenerator: clientIp,
});

/** Token-bearing public pages (set password, survey links): capped so a token can't be guessed by brute force. Each router gets its own counter. */
export const createPublicTokenLimiter = () =>
  limiter({
    windowMs: 15 * MINUTE,
    limit: 60,
    message: "Too many requests.",
    keyGenerator: clientIp,
  });
