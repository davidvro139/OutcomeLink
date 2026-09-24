import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET is required"),
  JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  // How many reverse proxies / load balancers sit in front of the API. Rate
  // limiting keys on the client address, which behind a proxy is only correct
  // if Express is told how many hops to trust; leave at 0 when the API is
  // reached directly (trusting X-Forwarded-For from anyone would let a caller
  // pick their own address and dodge the limits).
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  // Self-service registration (POST /api/auth/register) creates a brand-new
  // institution with its own System Administrator, which is right for local
  // development and wrong on a live deployment — anyone who can reach the API
  // could create one. Defaults on except in production; production creates its
  // first institution with the bootstrap script (npm run bootstrap).
  ALLOW_REGISTRATION: z.enum(["true", "false"]).optional(),
  // Where uploaded evidence, import files and generated reports are kept.
  // Defaults to ./uploads; a container mounts a persistent volume here.
  UPLOADS_DIR: z.string().optional(),
  // Backup status (Settings → Backups). A backup job reports each run to
  // POST /api/system/backup-checkin with this token; unset, the endpoint is
  // off and no stale-backup alerts are raised.
  BACKUP_CHECKIN_TOKEN: z.string().min(16, "BACKUP_CHECKIN_TOKEN must be at least 16 characters").optional(),
  // How long without a successful backup before it counts as stale.
  BACKUP_STALE_HOURS: z.coerce.number().int().min(1).default(36),
  // Encrypts DataSourceConnection.clientSecretEncrypted at rest (lib/secrets.ts)
  // — a real external credential (Dataverse/Azure AD app registration secret),
  // not something to leave in plaintext in the database.
  SECRETS_ENCRYPTION_KEY: z.string().min(1, "SECRETS_ENCRYPTION_KEY is required"),
  // Email delivery (lib/mailer.ts). Email is enabled only when both SMTP_HOST
  // and MAIL_FROM are set; otherwise every message falls back to the older
  // "copy this link" flows. The password stays here in the environment — an
  // operator-level secret, not per-institution data.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  // Base URL used in emailed links (survey, set-password). Defaults to CLIENT_ORIGIN.
  PUBLIC_APP_URL: z.string().optional(),
});

// Fail fast on missing/malformed config rather than at first use.
const parsed = envSchema.parse(process.env);

export const env = {
  ...parsed,
  ALLOW_REGISTRATION: parsed.ALLOW_REGISTRATION
    ? parsed.ALLOW_REGISTRATION === "true"
    : parsed.NODE_ENV !== "production",
};
