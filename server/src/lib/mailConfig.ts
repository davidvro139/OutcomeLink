import { env } from "../config/env";
import { prisma } from "./prisma";
import { decryptSecret } from "./secrets";

export interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

/** Where the mail settings in effect came from — shown on the Settings page. */
export type MailSource = "institution" | "server" | "none";

/** The server's own settings (environment variables) — the fallback for an institution that hasn't set its own. */
export function serverMailConfig(): MailConfig | null {
  if (!env.SMTP_HOST || !env.MAIL_FROM) return null;
  return {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER || undefined,
    password: env.SMTP_PASSWORD || undefined,
    from: env.MAIL_FROM,
  };
}

/**
 * The mail settings this institution's email goes out with: its own (Settings
 * → Email) when it has set a host and from-address, otherwise the server's,
 * otherwise none — in which case every message falls back to copy-a-link.
 */
export async function resolveMailConfig(
  institutionId: number,
): Promise<{ source: MailSource; config: MailConfig | null }> {
  const settings = await prisma.institutionSettings.findUnique({ where: { institutionId } });
  if (settings?.smtpHost && settings.mailFrom) {
    return {
      source: "institution",
      config: {
        host: settings.smtpHost,
        port: settings.smtpPort ?? 587,
        secure: settings.smtpSecure,
        user: settings.smtpUser || undefined,
        password: settings.smtpPasswordEncrypted
          ? decryptSecret(settings.smtpPasswordEncrypted)
          : undefined,
        from: settings.mailFrom,
      },
    };
  }
  const server = serverMailConfig();
  return server ? { source: "server", config: server } : { source: "none", config: null };
}
