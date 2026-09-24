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
export const env = envSchema.parse(process.env);
