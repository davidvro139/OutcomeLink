import nodemailer from "nodemailer";
import { env } from "../config/env";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** The slice of a nodemailer transport this app uses — small enough for tests to fake. */
export interface MailTransport {
  sendMail(message: OutgoingEmail & { from: string }): Promise<unknown>;
}

let testTransport: MailTransport | null = null;
let smtpTransport: MailTransport | null = null;

/** Tests inject a fake here; pass null to go back to "not configured". */
export function setMailTransportForTests(transport: MailTransport | null): void {
  testTransport = transport;
}

/**
 * Email is on only when SMTP is configured (both SMTP_HOST and MAIL_FROM) —
 * and never in the test environment unless a test injected a transport, so a
 * test run can't reach a real mail server even if a developer's shell has
 * SMTP variables set.
 */
export function isMailConfigured(): boolean {
  if (testTransport) return true;
  return env.NODE_ENV !== "test" && !!env.SMTP_HOST && !!env.MAIL_FROM;
}

function transport(): MailTransport {
  if (testTransport) return testTransport;
  smtpTransport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  return smtpTransport;
}

/** Sends one email, throwing on any transport failure. Callers go through emailDelivery.ts, which records the outcome. */
export async function sendMail(message: OutgoingEmail): Promise<void> {
  await transport().sendMail({ ...message, from: env.MAIL_FROM ?? "OutcomeLink <no-reply@outcomelink.invalid>" });
}
