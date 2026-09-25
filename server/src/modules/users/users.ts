import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { ROLES } from "@outcomelink/shared";
import { z } from "zod";
<<<<<<< HEAD
=======
import { publicUrl } from "../../lib/appUrls";
import { deliverEmail, emailResponseFields } from "../../lib/emailDelivery";
import { invitationEmail, passwordResetEmail } from "../../lib/emailTemplates";
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
import { ApiError } from "../../lib/apiError";
import { sendData } from "../../lib/apiResponse";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";

const PASSWORD_SET_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Institution staff directory, plus full User Administration (docs/TODO.md):
 * invitations, deactivation, password reset, and program/campus assignment.
 * `list()` stays the thin, active-only shape every staff picker in the app
 * already relies on unless the caller both asks for `includeInactive` and is
 * allowed to manage users — the extra fields are additive, so existing
 * pickers that ignore them are unaffected.
 */
export const listUsersQuerySchema = z.object({
  includeInactive: z.coerce.boolean().default(false),
});
type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

const CAN_MANAGE_USERS = ["SYSTEM_ADMINISTRATOR", "INSTITUTIONAL_ADMINISTRATOR"];

export async function list(req: Request, res: Response) {
  const { includeInactive } = req.query as unknown as ListUsersQuery;
  const institutionId = req.user!.institutionId;
  const honorIncludeInactive = includeInactive && CAN_MANAGE_USERS.includes(req.user!.role);

  const users = await prisma.user.findMany({
    where: { institutionId, ...(honorIncludeInactive ? {} : { active: true }) },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      programAccess: { select: { programId: true } },
      campusAccess: { select: { campusId: true } },
    },
    orderBy: { name: "asc" },
  });
  sendData(res, {
    users: users.map(({ programAccess, campusAccess, ...u }) => ({
      ...u,
      programIds: programAccess.map((a) => a.programId),
      campusIds: campusAccess.map((a) => a.campusId),
    })),
  });
}

async function findOwnedUser(institutionId: number, id: number) {
  const user = await prisma.user.findFirst({ where: { id, institutionId } });
  if (!user) throw ApiError.notFound("User not found");
  return user;
}

function newPasswordSetToken() {
  return { passwordSetToken: randomUUID(), passwordSetTokenExpiresAt: new Date(Date.now() + PASSWORD_SET_TOKEN_TTL_MS) };
}

export const inviteUserSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email(),
  role: z.enum(ROLES),
});
type InviteUserInput = z.infer<typeof inviteUserSchema>;

/**
<<<<<<< HEAD
 * No email/SMS infrastructure exists anywhere in this app — same honest
 * constraint the Graduate/Employer Survey system's responseToken already
 * works within. An invited user gets an unguessable placeholder password
 * (never communicated to anyone, including the inviting admin) and a
 * one-time token; the caller builds a copyable "set your password" link
 * from it, the same "Copy Link" pattern SurveysTab already uses.
=======
 * An invited user gets an unguessable placeholder password (never
 * communicated to anyone, including the inviting admin) and a one-time
 * token, which is emailed to them as a "set your password" link. The raw
 * token is returned to the admin only when the email could not be sent
 * (email not configured, or the send failed) — then the client falls back to
 * a copyable link, the same pattern SurveysTab uses. When it *was* emailed,
 * the credential travels to the invitee alone.
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
 */
export async function invite(
  req: Request<Record<string, never>, unknown, InviteUserInput>,
  res: Response,
) {
  const institutionId = req.user!.institutionId;
  const existing = await prisma.user.findUnique({ where: { email: req.body.email } });
  if (existing) throw ApiError.conflict("An account with this email already exists");

  const placeholderHash = await hashPassword(randomUUID());
  const { passwordSetToken, ...user } = await prisma.user.create({
    data: {
      institutionId,
      name: req.body.name,
      email: req.body.email,
      passwordHash: placeholderHash,
      role: req.body.role,
      ...newPasswordSetToken(),
    },
    select: { id: true, name: true, email: true, role: true, active: true, passwordSetToken: true },
  });
<<<<<<< HEAD
  sendData(res, { user, token: passwordSetToken }, 201);
=======
  const outcome = await deliverEmail({
    institutionId,
    purpose: "INVITATION",
    to: user.email,
    content: invitationEmail({ name: user.name, url: publicUrl(`/set-password/${passwordSetToken}`) }),
    relatedEntityType: "User",
    relatedEntityId: user.id,
  });
  sendData(
    res,
    { user, ...emailResponseFields(outcome), ...(outcome.status === "SENT" ? {} : { token: passwordSetToken }) },
    201,
  );
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
}

export const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().email().optional(),
  role: z.enum(ROLES).optional(),
});
type UpdateUserInput = z.infer<typeof updateUserSchema>;

export async function update(
  req: Request<{ id: string }, unknown, UpdateUserInput>,
  res: Response,
) {
  const institutionId = req.user!.institutionId;
  const userId = Number(req.params.id);
  await findOwnedUser(institutionId, userId);

  if (req.body.email) {
    const existing = await prisma.user.findUnique({ where: { email: req.body.email } });
    if (existing && existing.id !== userId) throw ApiError.conflict("An account with this email already exists");
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: req.body,
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  sendData(res, { user });
}

export const setUserActiveSchema = z.object({ active: z.boolean() });
type SetUserActiveInput = z.infer<typeof setUserActiveSchema>;

export async function setActive(
  req: Request<{ id: string }, unknown, SetUserActiveInput>,
  res: Response,
) {
  const institutionId = req.user!.institutionId;
  const userId = Number(req.params.id);
  await findOwnedUser(institutionId, userId);

  // Blocks a subsequent login/refresh immediately (both already check
  // `active`); an already-issued access token still runs out its own short
  // natural lifetime — an accepted, documented tradeoff, not a new gap, since
  // this app has no server-side token revocation for anything else either.
  const user = await prisma.user.update({
    where: { id: userId },
    data: { active: req.body.active },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  sendData(res, { user });
}

/** Same token mechanism as invite() — generating a new one supersedes any previous, so a stale link is never independently valid. */
export async function resetPassword(req: Request<{ id: string }>, res: Response) {
  const institutionId = req.user!.institutionId;
  const userId = Number(req.params.id);
  await findOwnedUser(institutionId, userId);

  const user = await prisma.user.update({
    where: { id: userId },
    data: newPasswordSetToken(),
<<<<<<< HEAD
    select: { passwordSetToken: true },
  });
  sendData(res, { token: user.passwordSetToken });
=======
    select: { id: true, name: true, email: true, passwordSetToken: true },
  });
  const outcome = await deliverEmail({
    institutionId,
    purpose: "PASSWORD_RESET",
    to: user.email,
    content: passwordResetEmail({ name: user.name, url: publicUrl(`/set-password/${user.passwordSetToken}`) }),
    relatedEntityType: "User",
    relatedEntityId: user.id,
  });
  sendData(res, {
    ...emailResponseFields(outcome),
    ...(outcome.status === "SENT" ? {} : { token: user.passwordSetToken }),
  });
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
}

export const setUserAccessSchema = z.object({
  programIds: z.array(z.coerce.number().int().positive()),
  campusIds: z.array(z.coerce.number().int().positive()),
});
type SetUserAccessInput = z.infer<typeof setUserAccessSchema>;

/**
 * Replace-all rather than incremental add/remove — the client always holds
 * and sends the complete desired set (two MultiSelects), so diffing against
 * the current grants and applying only the delta avoids a naive
 * delete-everything-then-recreate that would needlessly touch untouched rows.
 */
export async function setAccess(
  req: Request<{ id: string }, unknown, SetUserAccessInput>,
  res: Response,
) {
  const institutionId = req.user!.institutionId;
  const userId = Number(req.params.id);
  await findOwnedUser(institutionId, userId);

  const { programIds, campusIds } = req.body;
  if (programIds.length > 0) {
    const validPrograms = await prisma.program.count({ where: { id: { in: programIds }, institutionId } });
    if (validPrograms !== new Set(programIds).size) throw ApiError.badRequest("Unknown programId");
  }
  if (campusIds.length > 0) {
    const validCampuses = await prisma.campus.count({ where: { id: { in: campusIds }, institutionId } });
    if (validCampuses !== new Set(campusIds).size) throw ApiError.badRequest("Unknown campusId");
  }

  const [currentPrograms, currentCampuses] = await Promise.all([
    prisma.userProgramAccess.findMany({ where: { userId }, select: { programId: true } }),
    prisma.userCampusAccess.findMany({ where: { userId }, select: { campusId: true } }),
  ]);
  const currentProgramIds = new Set(currentPrograms.map((a) => a.programId));
  const currentCampusIds = new Set(currentCampuses.map((a) => a.campusId));
  const desiredProgramIds = new Set(programIds);
  const desiredCampusIds = new Set(campusIds);

  const programsToAdd = programIds.filter((id) => !currentProgramIds.has(id));
  const programsToRemove = [...currentProgramIds].filter((id) => !desiredProgramIds.has(id));
  const campusesToAdd = campusIds.filter((id) => !currentCampusIds.has(id));
  const campusesToRemove = [...currentCampusIds].filter((id) => !desiredCampusIds.has(id));

  await prisma.$transaction([
    ...(programsToRemove.length > 0
      ? [prisma.userProgramAccess.deleteMany({ where: { userId, programId: { in: programsToRemove } } })]
      : []),
    ...(campusesToRemove.length > 0
      ? [prisma.userCampusAccess.deleteMany({ where: { userId, campusId: { in: campusesToRemove } } })]
      : []),
    ...(programsToAdd.length > 0
      ? [prisma.userProgramAccess.createMany({ data: programsToAdd.map((programId) => ({ userId, programId })) })]
      : []),
    ...(campusesToAdd.length > 0
      ? [prisma.userCampusAccess.createMany({ data: campusesToAdd.map((campusId) => ({ userId, campusId })) })]
      : []),
  ]);

  sendData(res, { programIds: [...desiredProgramIds], campusIds: [...desiredCampusIds] });
}
