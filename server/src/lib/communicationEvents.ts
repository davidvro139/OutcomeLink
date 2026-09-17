import type { CommunicationEventType } from "@outcomelink/shared";
import { prisma } from "./prisma";

/**
 * Phase 2 P13 (docs/TODO.md): the single place every write to
 * CommunicationEvent goes through, so the timeline can't drift out of sync
 * with whatever wording each caller might otherwise invent independently.
 * Only wired into sources that actually have a real creation pathway today —
 * FollowUpAttempt and the four survey send/response actions. VERIFICATION_CONTACT
 * and NOTIFICATION are defined in the schema/enum but have no creation
 * endpoint anywhere yet (VerificationRecord and the `notifications` module are
 * both still unbuilt), so nothing calls this with those types yet.
 */
export function recordCommunicationEvent(params: {
  studentId: number;
  eventType: CommunicationEventType;
  sourceId: number;
  occurredAt: Date;
  summaryText: string;
}) {
  return prisma.communicationEvent.create({ data: params });
}
