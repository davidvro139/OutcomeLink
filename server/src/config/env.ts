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
  PUBLIC_APP_URL: z.string().url().optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  RATE_LIMIT_ENABLED: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  ALLOW_REGISTRATION: z.enum(["true", "false"]).optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  BACKUP_CHECKIN_TOKEN: z.string().optional(),
  BACKUP_STALE_HOURS: z.coerce.number().positive().default(36),
  UPLOADS_DIR: z.string().min(1).default("./uploads"),
  // Encrypts DataSourceConnection.clientSecretEncrypted at rest (lib/secrets.ts)
  // — a real external credential (Dataverse/Azure AD app registration secret),
  // not something to leave in plaintext in the database.
  SECRETS_ENCRYPTION_KEY: z.string().min(1, "SECRETS_ENCRYPTION_KEY is required"),
});

// Fail fast on missing/malformed config rather than at first use.
const parsed = envSchema.parse(process.env);

export const env = {
  ...parsed,
  ALLOW_REGISTRATION: parsed.ALLOW_REGISTRATION
    ? parsed.ALLOW_REGISTRATION === "true"
    : parsed.NODE_ENV !== "production",
};
