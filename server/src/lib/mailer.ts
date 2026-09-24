import nodemailer from "nodemailer";
import { env } from "../config/env";
import { type MailConfig, resolveMailConfig } from "./mailConfig";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** The slice of a nodemailer transport this app uses — small enough for tests to fake. The config it was asked to send with is passed along so tests can see which settings applied. */
export interface MailTransport {
  sendMail(message: OutgoingEmail & { from: string }, config?: MailConfig): Promise<unknown>;
}

let testTransport: MailTransport | null = null;
const transports = new Map<string, MailTransport>();

/** Tests inject a fake here; pass null to go back to "not configured". */
export function setMailTransportForTests(transport: MailTransport | null): void {
  testTransport = transport;
}

/** Forget cached connections — called when an institution's mail settings change. */
export function clearMailTransportCache(): void {
  transports.clear();
}

/**
 * Whether this institution's email can actually be sent: it has its own
 * settings or the server has some. Never true in the test environment unless a
 * test injected a transport, so a test run can't reach a real mail server even
 * if a developer's shell has SMTP variables set.
 */
export async function isMailConfiguredFor(institutionId: number): Promise<boolean> {
  if (testTransport) return true;
  if (env.NODE_ENV === "test") return false;
  return (await resolveMailConfig(institutionId)).config !== null;
}

/** Cheap, synchronous pre-check: could any email be sent at all from this process? False in tests without an injected transport. */
export function isMailPossible(): boolean {
  return testTransport !== null || env.NODE_ENV !== "test";
}

function transportFor(config: MailConfig): MailTransport {
  if (testTransport) return testTransport;
  const key = JSON.stringify(config);
  let transport = transports.get(key);
  if (!transport) {
    const smtp = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.password } : undefined,
      // A wrong host shouldn't hold a request open for minutes.
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
    // nodemailer treats a second argument to sendMail as a completion callback, so hand it the message alone —
    // the config parameter of MailTransport exists only so tests can see which settings applied.
    transport = { sendMail: (message) => smtp.sendMail(message) };
    transports.set(key, transport);
  }
  return transport;
}

/** Sends one email with the institution's settings (or the server's), throwing on any failure. Callers go through emailDelivery.ts, which records the outcome. */
export async function sendMail(message: OutgoingEmail, institutionId: number): Promise<void> {
  const { config } = await resolveMailConfig(institutionId);
  if (!config) {
    if (!testTransport) throw new Error("Email is not configured");
    return void (await testTransport.sendMail({
      ...message,
      from: "OutcomeLink <no-reply@outcomelink.invalid>",
    }));
  }
  await transportFor(config).sendMail({ ...message, from: config.from }, config);
}
