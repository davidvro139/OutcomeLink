import type { Request, Response } from "express";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";

/**
 * Licensure Queue (Phase 2 P1, spec §63): every graduate completer of a
 * licensure-required program who doesn't yet have a resolved (PASSED/FAILED)
 * exam result on file — mirrors the Follow-Up Queue's "operational worklist"
 * shape, distinct from the CPL Dashboard's aggregate pass-rate percentages.
 * Not paginated: this list is bounded by graduate completers in
 * licensure-required programs, a small slice of the student body.
 */
export async function queue(req: Request, res: Response) {
  const institutionId = req.user!.institutionId;

  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      enrollmentStatus: "GRADUATE_COMPLETER",
      reportableForAccreditation: true,
      student: { institutionId },
      program: { licensureRequired: true },
    },
    include: {
      student: { select: { id: true, firstName: true, lastName: true } },
      program: { select: { id: true, name: true } },
    },
    orderBy: { actualCompletionDate: "desc" },
  });

  const rows = [];
  for (const enrollment of enrollments) {
    const latest = await prisma.licensureResult.findFirst({
      where: { studentId: enrollment.studentId, programId: enrollment.programId },
      orderBy: { attemptNumber: "desc" },
    });
    if (latest && (latest.result === "PASSED" || latest.result === "FAILED")) continue;

    rows.push({
      student: enrollment.student,
      program: enrollment.program,
      completionDate: enrollment.actualCompletionDate,
      latestResult: latest
        ? {
            id: latest.id,
            examName: latest.examName,
            result: latest.result,
            scheduledDate: latest.scheduledDate,
            examDate: latest.examDate,
            attemptNumber: latest.attemptNumber,
          }
        : null,
    });
  }

  sendData(res, { queue: rows });
}
