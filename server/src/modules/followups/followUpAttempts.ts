import type { Request, Response } from "express";
import { FOLLOW_UP_METHODS, FOLLOW_UP_OUTCOMES } from "@outcomelink/shared";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { recordCommunicationEvent } from "../../lib/communicationEvents";
import { prisma } from "../../lib/prisma";

function followUpSummary(method: string, outcome: string): string {
  return `Follow-up via ${method} — outcome: ${outcome.replaceAll("_", " ")}`;
}

export const createFollowUpAttemptSchema = z.object({
  attemptedAt: z.coerce.date(),
  method: z.enum(FOLLOW_UP_METHODS),
  outcome: z.enum(FOLLOW_UP_OUTCOMES),
  notes: z.string().trim().max(5000).optional(),
  nextFollowUpDate: z.coerce.date().optional(),
});
type CreateFollowUpAttemptInput = z.infer<typeof createFollowUpAttemptSchema>;

export const bulkCreateFollowUpAttemptSchema = createFollowUpAttemptSchema.extend({
  studentIds: z.array(z.coerce.number().int().positive()).min(1).max(200),
});
type BulkCreateFollowUpAttemptInput = z.infer<typeof bulkCreateFollowUpAttemptSchema>;

async function findOwnedStudent(institutionId: number, studentId: number) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, institutionId },
    include: { communicationPreference: true },
  });
  if (!student) throw ApiError.notFound("Student not found");
  return student;
}

export async function list(req: Request, res: Response) {
  const studentId = Number(req.params.studentId);
  await findOwnedStudent(req.user!.institutionId, studentId);
  const followUpAttempts = await prisma.followUpAttempt.findMany({
    where: { studentId },
    orderBy: { attemptedAt: "desc" },
    include: { staffUser: { select: { id: true, name: true } } },
  });
  sendData(res, { followUpAttempts });
}

export async function create(
  req: Request<{ studentId: string }, unknown, CreateFollowUpAttemptInput>,
  res: Response,
) {
  const studentId = Number(req.params.studentId);
  const student = await findOwnedStudent(req.user!.institutionId, studentId);

  // Consent enforcement (spec §11): a contact method the student opted out of
  // shouldn't be used. We record what actually happened rather than silently
  // block it — staff may need to log a call that already took place — but
  // refuse the one case that's unambiguous: attempting a student who is
  // flagged do-not-contact at all.
  if (student.communicationPreference?.doNotContact) {
    throw ApiError.conflict("This student is flagged do-not-contact");
  }

  const followUpAttempt = await prisma.followUpAttempt.create({
    data: { ...req.body, studentId, staffUserId: req.user!.sub },
  });
  await recordCommunicationEvent({
    studentId,
    eventType: "FOLLOW_UP_ATTEMPT",
    sourceId: followUpAttempt.id,
    occurredAt: followUpAttempt.attemptedAt,
    summaryText: followUpSummary(followUpAttempt.method, followUpAttempt.outcome),
  });
  sendData(res, { followUpAttempt }, 201);
}

/**
 * Phase 2 P11 (docs/TODO.md): log the same attempt (e.g. "called everyone on
 * this page, no answer") against many Follow-Up Queue rows in one action
 * instead of opening each student's page individually. Creates rows one at a
 * time (rather than `createMany`) so each gets a real id to hang a P13
 * CommunicationEvent off of — `createMany` only returns a count, not the
 * created rows. The audit-log Prisma extension still doesn't instrument
 * these per-row (same documented scope boundary as merge.ts's child-record
 * reassignment); the bulk action itself is visible via the created rows.
 * A student not found in this institution, or flagged do-not-contact, is
 * skipped rather than failing the whole batch — the reason comes back per
 * student so the caller can show exactly who didn't get logged and why.
 */
export async function bulkCreate(
  req: Request<Record<string, never>, unknown, BulkCreateFollowUpAttemptInput>,
  res: Response,
) {
  const { studentIds, ...attempt } = req.body;
  const institutionId = req.user!.institutionId;

  const students = await prisma.student.findMany({
    where: { id: { in: studentIds }, institutionId },
    include: { communicationPreference: true },
  });
  const studentsById = new Map(students.map((s) => [s.id, s]));

  const skipped: { studentId: number; reason: string }[] = [];
  const eligibleIds: number[] = [];
  for (const studentId of studentIds) {
    const student = studentsById.get(studentId);
    if (!student) {
      skipped.push({ studentId, reason: "Student not found" });
    } else if (student.communicationPreference?.doNotContact) {
      skipped.push({ studentId, reason: "Flagged do-not-contact" });
    } else {
      eligibleIds.push(studentId);
    }
  }

  const createdAttempts = await Promise.all(
    eligibleIds.map((studentId) =>
      prisma.followUpAttempt.create({
        data: { ...attempt, studentId, staffUserId: req.user!.sub },
      }),
    ),
  );
  await Promise.all(
    createdAttempts.map((followUpAttempt) =>
      recordCommunicationEvent({
        studentId: followUpAttempt.studentId,
        eventType: "FOLLOW_UP_ATTEMPT",
        sourceId: followUpAttempt.id,
        occurredAt: followUpAttempt.attemptedAt,
        summaryText: followUpSummary(followUpAttempt.method, followUpAttempt.outcome),
      }),
    ),
  );

  sendData(res, { createdCount: createdAttempts.length, skipped }, 201);
}
