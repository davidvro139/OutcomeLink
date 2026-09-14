import type { EvidenceType } from "@outcomelink/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, apiRequestBlob } from "../lib/apiClient";

export interface Evidence {
  id: number;
  evidenceType: EvidenceType;
  fileReference: string;
  description: string | null;
  uploadedBy: string;
  uploadedAt: string;
  verificationStatus: string | null;
  outcomeRecordId: number | null;
  employmentRecordId: number | null;
  licensureResultId: number | null;
}

export type EvidenceTarget =
  { outcomeRecordId: number } | { employmentRecordId: number } | { licensureResultId: number };

function targetQuery(target: EvidenceTarget): string {
  const [key, value] = Object.entries(target)[0]!;
  return `${key}=${value}`;
}

export function useEvidenceList(target: EvidenceTarget | undefined) {
  return useQuery({
    queryKey: ["evidence", target],
    queryFn: () =>
      apiRequest<{ evidence: Evidence[] }>(`/api/evidence?${targetQuery(target!)}`).then(
        (r) => r.evidence,
      ),
    enabled: target !== undefined,
  });
}

export function useUploadEvidence(target: EvidenceTarget) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      evidenceType,
      description,
    }: {
      file: File;
      evidenceType: EvidenceType;
      description?: string;
    }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("evidenceType", evidenceType);
      if (description) formData.append("description", description);
      const [key, value] = Object.entries(target)[0]!;
      formData.append(key, String(value));

      return apiRequest<{ evidence: Evidence }>("/api/evidence", {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["evidence", target] }),
  });
}

/** Fetches the file with the Authorization header attached, then opens it via a blob: URL. */
export async function openEvidenceFile(id: number): Promise<void> {
  const blob = await apiRequestBlob(`/api/evidence/${id}/file`);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  // Revoke once the new tab/window has had a chance to load it.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
