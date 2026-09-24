import type { EmailPurpose } from "@prisma/client";
import type { EmailContent } from "./emailTemplates";
import { isMailConfigured, sendMail } from "./mailer";
import { prisma } from "./prisma";

/**
 * SKIPPED = nothing was attempted (email isn't configured, or the recipient
 * can't be emailed) — no EmailDelivery row is written for it. SENT/FAILED are
 * real transport attempts and are always recorded.
 */
export type EmailOutcome =
  | { status: "SENT" }
  | { status: "FAILED"; reason: string }
  | { status: "SKIPPED"; reason: string };

export const EMAIL_NOT_CONFIGURED = "Email is not configured";

interface DeliverInput {
  institutionId: number;
  purpose: EmailPurpose;
  to: string;
  content: EmailContent;
  relatedEntityType?: string;
  relatedEntityId?: number;
}

/** Sends one email and records the outcome. Never throws: a failed send is a result the caller reports, not an exception that aborts its own work. */
export async function deliverEmail(input: DeliverInput): Promise<EmailOutcome> {
  if (!isMailConfigured()) return { status: "SKIPPED", reason: EMAIL_NOT_CONFIGURED };

  let outcome: EmailOutcome = { status: "SENT" };
  try {
    await sendMail({ to: input.to, subject: input.content.subject, text: input.content.text, html: input.content.html });
  } catch (err) {
    outcome = { status: "FAILED", reason: err instanceof Error ? err.message : String(err) };
  }

  try {
    await prisma.emailDelivery.create({
      data: {
        institutionId: input.institutionId,
        purpose: input.purpose,
        toAddress: input.to,
        subject: input.content.subject.slice(0, 191),
        status: outcome.status === "SENT" ? "SENT" : "FAILED",
        errorMessage: outcome.status === "FAILED" ? outcome.reason : null,
        relatedEntityType: input.relatedEntityType,
        relatedEntityId: input.relatedEntityId,
      },
    });
  } catch (err) {
    // The message already went (or already failed); a bookkeeping failure must not turn that into a second error.
    console.error("Could not record email delivery", err);
  }
  return outcome;
}

export async function institutionName(institutionId: number): Promise<string> {
  const institution = await prisma.institution.findUnique({ where: { id: institutionId }, select: { name: true } });
  return institution?.name ?? "Your institution";
}

/** What an API response tells the client about an email it asked for. `token`-style fallbacks are the caller's decision. */
export function emailResponseFields(outcome: EmailOutcome) {
  return {
    emailStatus: outcome.status,
    ...(outcome.status === "SENT" ? {} : { emailReason: outcome.reason }),
  };
}

export type Recipient<T> = ({ email: string } & T) | { skipped: string };

/** A student can be emailed only with an address on file and no do-not-contact flag — the same rule follow-up attempts already enforce. */
export async function studentEmailTarget(
  studentId: number,
): Promise<Recipient<{ firstName: string }>> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { firstName: true, email: true, communicationPreference: { select: { doNotContact: true } } },
  });
  if (!student) return { skipped: "Student not found" };
  if (student.communicationPreference?.doNotContact) return { skipped: "Flagged do-not-contact" };
  if (!student.email) return { skipped: "No email on file" };
  return { email: student.email, firstName: student.firstName };
}

/**
 * Which employer contact gets a survey email: the one asked for, else a
 * verification contact, else the primary contact, else anyone with an address.
 */
export async function employerContactTarget(
  employerId: number,
  contactId?: number,
): Promise<Recipient<{ name: string }>> {
  const contacts = await prisma.employerContact.findMany({
    where: { employerId, email: { not: null } },
    orderBy: { id: "asc" },
  });
  const chosen = contactId
    ? contacts.find((c) => c.id === contactId)
    : (contacts.find((c) => c.isVerificationContact) ?? contacts.find((c) => c.isPrimaryContact) ?? contacts[0]);
  if (!chosen?.email) return { skipped: contactId ? "That contact has no email address" : "No employer contact has an email address" };
  return { email: chosen.email, name: chosen.name };
}
