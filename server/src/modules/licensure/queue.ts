import type { Request, Response } from "express";
import { getAccessibleProgramIds } from "../../lib/accessScope";
<<<<<<< HEAD
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";

=======
import { sendPaginated, toPagination } from "../../lib/apiResponse";
import { paginationQuerySchema, type PaginationQuery } from "../../lib/pagination";
import { prisma } from "../../lib/prisma";

export const licensureQueueQuerySchema = paginationQuerySchema;

>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
/**
 * Licensure Queue (Phase 2 P1, spec §63): every graduate completer of a
 * licensure-required program who doesn't yet have a resolved (PASSED/FAILED)
 * exam result on file — mirrors the Follow-Up Queue's "operational worklist"
 * shape, distinct from the CPL Dashboard's aggregate pass-rate percentages.
<<<<<<< HEAD
 * Not paginated: this list is bounded by graduate completers in
 * licensure-required programs, a small slice of the student body.
 */
export async function queue(req: Request, res: Response) {
=======
 *
 * Report pagination and bounded exports (docs/TODO.md): this used to run one
 * `licensureResult.findFirst` query per enrollment (N+1) with no pagination
 * at all — fixed the N+1 by batch-fetching every candidate's licensure
 * results in a single query and reducing to "latest per student+program" in
 * memory. True DB-level pagination isn't reachable here though, same
 * fundamental limitation the Follow-Up Queue's own "known limitation"
 * comment already documents: "does this student have a resolved result yet"
 * is a correlated condition across two tables with no direct relation
 * between them, which Prisma can't express as a `where` clause without
 * dropping to raw SQL. Pagination below is still real (bounded response
 * size, real page/pageSize), just applied in memory after the eligible
 * population is computed rather than at the database layer.
 */
export async function queue(req: Request, res: Response) {
  const { page, pageSize } = req.query as unknown as PaginationQuery;
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
  const institutionId = req.user!.institutionId;
  const accessibleProgramIds = await getAccessibleProgramIds(req.user!);

  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      enrollmentStatus: "GRADUATE_COMPLETER",
      reportableForAccreditation: true,
      student: { institutionId },
      program: {
        licensureRequired: true,
        ...(accessibleProgramIds && { id: { in: accessibleProgramIds } }),
      },
    },
    include: {
      student: { select: { id: true, firstName: true, lastName: true } },
      program: { select: { id: true, name: true } },
    },
    orderBy: { actualCompletionDate: "desc" },
  });

<<<<<<< HEAD
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
=======
  const studentIds = [...new Set(enrollments.map((e) => e.studentId))];
  const results = await prisma.licensureResult.findMany({
    where: { studentId: { in: studentIds } },
    orderBy: { attemptNumber: "desc" },
  });
  // Results are already ordered by attemptNumber desc, so the first one seen
  // per (studentId, programId) key is the latest attempt.
  const latestByKey = new Map<string, (typeof results)[number]>();
  for (const r of results) {
    const key = `${r.studentId}:${r.programId}`;
    if (!latestByKey.has(key)) latestByKey.set(key, r);
  }

  const allRows = enrollments
    .map((enrollment) => {
      const latest = latestByKey.get(`${enrollment.studentId}:${enrollment.programId}`) ?? null;
      return {
        resolved: latest !== null && (latest.result === "PASSED" || latest.result === "FAILED"),
        row: {
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
        },
      };
    })
    .filter((r) => !r.resolved)
    .map((r) => r.row);

  const start = (page - 1) * pageSize;
  const pageRows = allRows.slice(start, start + pageSize);
  sendPaginated(res, pageRows, toPagination(page, pageSize, allRows.length));
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
}
