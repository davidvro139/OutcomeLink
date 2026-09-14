import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/apiClient";

export interface AuditLogEntry {
  id: number;
  entityType: string;
  entityId: number;
  action: string;
  fieldChanged: string | null;
  previousValue: string | null;
  newValue: string | null;
  occurredAt: string;
  reason: string | null;
  user: { id: number; name: string };
}

export function useAuditHistory(entityType: string, entityId: number | undefined) {
  return useQuery({
    queryKey: ["audit", entityType, entityId],
    queryFn: () =>
      apiRequest<{ entries: AuditLogEntry[] }>(
        `/api/audit?entityType=${entityType}&entityId=${entityId}`,
      ).then((r) => r.entries),
    enabled: entityId !== undefined,
  });
}
