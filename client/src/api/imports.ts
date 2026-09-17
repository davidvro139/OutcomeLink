import type { ImportBatchStatus, ImportColumnMapping, ImportTargetField } from "@outcomelink/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/apiClient";

export interface MappingProfile {
  id: number;
  institutionId: number;
  sourceSystemName: string;
  columnMapping: ImportColumnMapping;
}

export interface ImportBatch {
  id: number;
  sourceSystem: string;
  originalFilename: string | null;
  uploadedBy: string;
  uploadedAt: string;
  mappingProfileId: number | null;
  columnMapping: ImportColumnMapping | null;
  totalRows: number | null;
  importedRowCount: number | null;
  status: ImportBatchStatus;
  mappingProfile?: { id: number; sourceSystemName: string } | null;
}

export interface ImportRowError {
  id: number;
  importBatchId: number;
  rowNumber: number;
  errorMessage: string;
  rawRowData: Record<string, string>;
}

export interface PreviewRow {
  rowNumber: number;
  candidate: Partial<Record<ImportTargetField, string>>;
}

export function useMappingProfiles() {
  return useQuery({
    queryKey: ["imports", "mapping-profiles"],
    queryFn: () =>
      apiRequest<{ mappingProfiles: MappingProfile[] }>("/api/imports/mapping-profiles").then(
        (r) => r.mappingProfiles,
      ),
  });
}

export function useImportBatches() {
  return useQuery({
    queryKey: ["imports", "batches"],
    queryFn: () => apiRequest<{ batches: ImportBatch[] }>("/api/imports/batches").then((r) => r.batches),
  });
}

export function useImportBatch(id: number | undefined) {
  return useQuery({
    queryKey: ["imports", "batches", id],
    queryFn: () =>
      apiRequest<{ batch: ImportBatch; rowErrors: ImportRowError[]; sourceColumns: string[] }>(
        `/api/imports/batches/${id}`,
      ),
    enabled: id !== undefined,
  });
}

export function useUploadImportBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, sourceSystem }: { file: File; sourceSystem: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sourceSystem", sourceSystem);
      return apiRequest<{
        batch: ImportBatch;
        sourceColumns: string[];
        suggestedProfile: MappingProfile | null;
      }>("/api/imports/batches", { method: "POST", body: formData });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["imports", "batches"] }),
  });
}

export function useSetImportMapping(batchId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      columnMapping: ImportColumnMapping;
      mappingProfileId?: number;
      saveAsProfile?: boolean;
    }) =>
      apiRequest<{ batch: ImportBatch }>(`/api/imports/batches/${batchId}/mapping`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["imports", "batches", batchId] });
      queryClient.invalidateQueries({ queryKey: ["imports", "mapping-profiles"] });
    },
  });
}

export function useValidateImportBatch(batchId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<{ batch: ImportBatch; validRowCount: number; errorRowCount: number }>(
        `/api/imports/batches/${batchId}/validate`,
        { method: "POST" },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["imports", "batches", batchId] }),
  });
}

export function useImportPreview(batchId: number | undefined, page: number, pageSize = 25) {
  return useQuery({
    queryKey: ["imports", "batches", batchId, "preview", page, pageSize],
    queryFn: () =>
      apiRequest<{
        items: PreviewRow[];
        page: number;
        pageSize: number;
        totalValidRows: number;
        totalErrorRows: number;
      }>(`/api/imports/batches/${batchId}/preview?page=${page}&pageSize=${pageSize}`),
    enabled: batchId !== undefined,
  });
}

export function useCommitImportBatch(batchId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<{ batch: ImportBatch; importedRowCount: number }>(
        `/api/imports/batches/${batchId}/commit`,
        { method: "POST" },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["imports", "batches"] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
    },
  });
}
