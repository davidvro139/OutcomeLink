import type { Request, Response } from "express";
import { z } from "zod";
import { getAccessibleProgramIds, studentProgramScopeFilter } from "../../lib/accessScope";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";
import { studentNameSearchFilter } from "../students/students";

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
});

const RESULT_LIMIT = 5;

/**
 * Spec §54: global search across Student, Employer, Program, and Contact —
 * scoped to the caller's institution, and Student/Program results are
 * further scoped to a program-restricted user's assigned programs. Employer
 * and Contact are deliberately not scoped: an employer isn't owned by one
 * program (it can hire from several), and Career Services — the role most
 * concerned with employers — is explicitly institution-wide per spec §4.
 */
export async function search(req: Request, res: Response) {
  const { q } = req.query as unknown as z.infer<typeof searchQuerySchema>;
  const institutionId = req.user!.institutionId;
  const accessibleProgramIds = await getAccessibleProgramIds(req.user!);

  const [students, employers, programs, contacts] = await Promise.all([
    prisma.student.findMany({
      where: { institutionId, ...studentNameSearchFilter(q), ...studentProgramScopeFilter(accessibleProgramIds) },
      select: { id: true, firstName: true, lastName: true, internalStudentId: true },
      take: RESULT_LIMIT,
    }),
    prisma.employer.findMany({
      where: { institutionId, name: { contains: q } },
      select: { id: true, name: true },
      take: RESULT_LIMIT,
    }),
    prisma.program.findMany({
      where: {
        institutionId,
        name: { contains: q },
        ...(accessibleProgramIds && { id: { in: accessibleProgramIds } }),
      },
      select: { id: true, name: true, code: true },
      take: RESULT_LIMIT,
    }),
    prisma.employerContact.findMany({
      where: { name: { contains: q }, employer: { institutionId } },
      select: { id: true, name: true, employerId: true, employer: { select: { name: true } } },
      take: RESULT_LIMIT,
    }),
  ]);

  sendData(res, {
    students: students.map((s) => ({ id: s.id, label: `${s.firstName} ${s.lastName}`, subLabel: s.internalStudentId })),
    employers: employers.map((e) => ({ id: e.id, label: e.name })),
    programs: programs.map((p) => ({ id: p.id, label: p.name, subLabel: p.code })),
    contacts: contacts.map((c) => ({ id: c.id, label: c.name, subLabel: c.employer.name, employerId: c.employerId })),
  });
}
