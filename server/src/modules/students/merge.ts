import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";

export const mergeStudentsSchema = z.object({
  mergedStudentId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(1).max(2000),
});
type MergeStudentsInput = z.infer<typeof mergeStudentsSchema>;

/**
 * Candidates for merging into the given student: other students at the same
 * institution with the same normalized first+last name, using the exact same
 * match rule validationEngine.ts uses to raise POSSIBLE_DUPLICATE_STUDENT —
 * so a candidate list can never disagree with the issue that sent staff here
 * in the first place. Excludes anyone already merged away (they're no longer
 * a live record to merge again).
 */
export async function duplicateCandidates(req: Request<{ id: string }>, res: Response) {
  const studentId = Number(req.params.id);
  const institutionId = req.user!.institutionId;

  const student = await prisma.student.findFirst({ where: { id: studentId, institutionId } });
  if (!student) throw ApiError.notFound("Student not found");

  const alreadyMergedIds = new Set(
    (await prisma.studentMergeLog.findMany({ select: { mergedStudentId: true } })).map(
      (m) => m.mergedStudentId,
    ),
  );

  // Same normalized-name match rule validationEngine.ts uses to raise
  // POSSIBLE_DUPLICATE_STUDENT — MySQL has no case-insensitive `mode` filter
  // like Postgres, so this compares in JS the same way that check does.
  const normalizedTarget = `${student.firstName.trim().toLowerCase()}|${student.lastName.trim().toLowerCase()}`;
  const institutionStudents = await prisma.student.findMany({
    where: { institutionId, id: { not: studentId } },
    select: { id: true, internalStudentId: true, firstName: true, lastName: true, email: true },
  });
  const candidates = institutionStudents.filter(
    (candidate) =>
      !alreadyMergedIds.has(candidate.id) &&
      `${candidate.firstName.trim().toLowerCase()}|${candidate.lastName.trim().toLowerCase()}` ===
        normalizedTarget,
  );

  sendData(res, { candidates });
}

/**
 * Duplicate Student Resolution — spec §23. Reassigns every child record from
 * the merged-away student onto the survivor and records the merge itself
 * (who/when/why) via StudentMergeLog, which the audit-log Prisma extension
 * picks up automatically as a CREATE. The merged-away Student row is never
 * deleted or mutated — it stays retrievable for audit purposes, and
 * StudentMergeLog is the authoritative record that it was merged into
 * another student (spec: "should remain retrievable... rather than deleted").
 *
 * Child reassignment uses updateMany, which the audit extension doesn't
 * instrument per-row (documented scope boundary in server/src/lib/prisma.ts)
 * — the merge action itself is still fully audited via the StudentMergeLog
 * create, which is what spec §23 actually asks to have audited.
 */
export async function merge(
  req: Request<{ id: string }, unknown, MergeStudentsInput>,
  res: Response,
) {
  const survivingStudentId = Number(req.params.id);
  const { mergedStudentId, reason } = req.body;
  const institutionId = req.user!.institutionId;

  if (survivingStudentId === mergedStudentId) {
    throw ApiError.badRequest("A student cannot be merged into itself");
  }

  const [survivor, merged] = await Promise.all([
    prisma.student.findFirst({ where: { id: survivingStudentId, institutionId } }),
    prisma.student.findFirst({ where: { id: mergedStudentId, institutionId } }),
  ]);
  if (!survivor) throw ApiError.notFound("Surviving student not found");
  if (!merged) throw ApiError.notFound("Student to merge not found");

  const alreadyMerged = await prisma.studentMergeLog.findFirst({ where: { mergedStudentId } });
  if (alreadyMerged)
    throw ApiError.conflict("This student has already been merged into another record");

  const survivorAlreadyMergedAway = await prisma.studentMergeLog.findFirst({
    where: { mergedStudentId: survivingStudentId },
  });
  if (survivorAlreadyMergedAway) {
    throw ApiError.conflict(
      "The surviving record has itself already been merged into another student — merge into that record instead",
    );
  }

  const actingUser = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { name: true },
  });
  const performedBy = actingUser?.name ?? String(req.user!.sub);

  const mergeLog = await prisma.$transaction(async (tx) => {
    await tx.studentEnrollment.updateMany({
      where: { studentId: mergedStudentId },
      data: { studentId: survivingStudentId },
    });
    await tx.employmentRecord.updateMany({
      where: { studentId: mergedStudentId },
      data: { studentId: survivingStudentId },
    });
    await tx.licensureResult.updateMany({
      where: { studentId: mergedStudentId },
      data: { studentId: survivingStudentId },
    });
    await tx.followUpAttempt.updateMany({
      where: { studentId: mergedStudentId },
      data: { studentId: survivingStudentId },
    });
    await tx.communicationEvent.updateMany({
      where: { studentId: mergedStudentId },
      data: { studentId: survivingStudentId },
    });
    await tx.graduateSurvey.updateMany({
      where: { studentId: mergedStudentId },
      data: { studentId: survivingStudentId },
    });
    await tx.employerSurvey.updateMany({
      where: { studentId: mergedStudentId },
      data: { studentId: survivingStudentId },
    });
    await tx.validationIssue.updateMany({
      where: { studentId: mergedStudentId },
      data: { studentId: survivingStudentId },
    });

    // StudentCommunicationPreference is 1:1 (unique studentId) — can't just
    // reassign if the survivor already has one. Reconcile conservatively:
    // a do-not-contact flag from either record must carry over.
    const [survivorPref, mergedPref] = await Promise.all([
      tx.studentCommunicationPreference.findUnique({ where: { studentId: survivingStudentId } }),
      tx.studentCommunicationPreference.findUnique({ where: { studentId: mergedStudentId } }),
    ]);

    if (mergedPref && !survivorPref) {
      await tx.studentCommunicationPreference.update({
        where: { id: mergedPref.id },
        data: { studentId: survivingStudentId },
      });
    } else if (mergedPref && survivorPref) {
      if (mergedPref.doNotContact && !survivorPref.doNotContact) {
        await tx.studentCommunicationPreference.update({
          where: { id: survivorPref.id },
          data: {
            doNotContact: true,
            doNotContactReason: mergedPref.doNotContactReason ?? survivorPref.doNotContactReason,
          },
        });
      }
      await tx.studentCommunicationPreference.delete({ where: { id: mergedPref.id } });
    }

    return tx.studentMergeLog.create({
      data: { survivingStudentId, mergedStudentId, performedBy, reason },
    });
  });

  const updatedSurvivor = await prisma.student.findUnique({
    where: { id: survivingStudentId },
    include: { communicationPreference: true },
  });
  sendData(res, { student: updatedSurvivor, mergeLog });
}
