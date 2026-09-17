import type { Request, Response } from "express";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";

async function findOwnedStudent(institutionId: number, studentId: number) {
  const student = await prisma.student.findFirst({ where: { id: studentId, institutionId } });
  if (!student) throw ApiError.notFound("Student not found");
  return student;
}

/**
 * Phase 2 P13 (docs/TODO.md): a single chronological view over every source
 * that writes to CommunicationEvent (server/src/lib/communicationEvents.ts).
 * summaryText is stored on the event row itself at write time, so this reads
 * straight off CommunicationEvent with no per-source joins — a follow-up
 * attempt, a sent survey, and a survey response all render the same way.
 */
export async function list(req: Request, res: Response) {
  const studentId = Number(req.params.studentId);
  await findOwnedStudent(req.user!.institutionId, studentId);

  const events = await prisma.communicationEvent.findMany({
    where: { studentId },
    orderBy: { occurredAt: "desc" },
  });
  sendData(res, { events });
}
