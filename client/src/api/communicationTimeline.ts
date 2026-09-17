import type { CommunicationEventType } from "@outcomelink/shared";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/apiClient";

export interface CommunicationEvent {
  id: number;
  studentId: number;
  eventType: CommunicationEventType;
  sourceId: number;
  occurredAt: string;
  summaryText: string;
}

export function useCommunicationTimeline(studentId: number | undefined) {
  return useQuery({
    queryKey: ["students", studentId, "communication-timeline"],
    queryFn: () =>
      apiRequest<{ events: CommunicationEvent[] }>(
        `/api/students/${studentId}/communication-timeline`,
      ).then((r) => r.events),
    enabled: studentId !== undefined,
  });
}
