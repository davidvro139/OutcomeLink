import type { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { prisma } from "../../lib/prisma";

export const createContactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  title: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().optional(),
  isPrimaryContact: z.boolean().default(false),
  isVerificationContact: z.boolean().default(false),
});
type CreateContactInput = z.infer<typeof createContactSchema>;

export const updateContactSchema = createContactSchema.partial();
type UpdateContactInput = z.infer<typeof updateContactSchema>;

async function findOwnedEmployer(institutionId: number, employerId: number) {
  const employer = await prisma.employer.findFirst({ where: { id: employerId, institutionId } });
  if (!employer) throw ApiError.notFound("Employer not found");
  return employer;
}

async function findOwnedContact(institutionId: number, employerId: number, id: number) {
  await findOwnedEmployer(institutionId, employerId);
  const contact = await prisma.employerContact.findFirst({ where: { id, employerId } });
  if (!contact) throw ApiError.notFound("Employer contact not found");
  return contact;
}

export async function list(req: Request, res: Response) {
  const employerId = Number(req.params.employerId);
  await findOwnedEmployer(req.user!.institutionId, employerId);
  const contacts = await prisma.employerContact.findMany({
    where: { employerId },
    orderBy: { name: "asc" },
  });
  sendData(res, { contacts });
}

export async function create(
  req: Request<{ employerId: string }, unknown, CreateContactInput>,
  res: Response,
) {
  const employerId = Number(req.params.employerId);
  await findOwnedEmployer(req.user!.institutionId, employerId);
  const contact = await prisma.employerContact.create({ data: { ...req.body, employerId } });
  sendData(res, { contact }, 201);
}

export async function update(
  req: Request<{ employerId: string; id: string }, unknown, UpdateContactInput>,
  res: Response,
) {
  const employerId = Number(req.params.employerId);
  const id = Number(req.params.id);
  await findOwnedContact(req.user!.institutionId, employerId, id);
  const contact = await prisma.employerContact.update({ where: { id }, data: req.body });
  sendData(res, { contact });
}

export async function remove(req: Request, res: Response) {
  const employerId = Number(req.params.employerId);
  const id = Number(req.params.id);
  await findOwnedContact(req.user!.institutionId, employerId, id);
  await prisma.employerContact.delete({ where: { id } });
  sendData(res, { deleted: true });
}
