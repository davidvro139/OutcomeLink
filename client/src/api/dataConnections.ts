import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/apiClient";
import type { ImportBatch } from "./imports";

export interface DataSourceConnection {
  id: number;
  institutionId: number;
  name: string;
  type: string;
  environmentUrl: string;
  tenantId: string;
  clientId: string;
  entityLogicalName: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastTestedAt: string | null;
  lastTestStatus: "SUCCESS" | "FAILED" | null;
  lastTestError: string | null;
}

export interface ConnectionInput {
  name: string;
  environmentUrl: string;
  tenantId: string;
  clientId: string;
  clientSecret?: string;
  entityLogicalName: string;
}

export function useDataConnections() {
  return useQuery({
    queryKey: ["imports", "connections"],
    queryFn: () =>
      apiRequest<{ connections: DataSourceConnection[] }>("/api/imports/connections").then(
        (r) => r.connections,
      ),
  });
}

export function useCreateDataConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConnectionInput) =>
      apiRequest<{ connection: DataSourceConnection }>("/api/imports/connections", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["imports", "connections"] }),
  });
}

export function useUpdateDataConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<ConnectionInput> }) =>
      apiRequest<{ connection: DataSourceConnection }>(`/api/imports/connections/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["imports", "connections"] }),
  });
}

export function useDeleteDataConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiRequest(`/api/imports/connections/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["imports", "connections"] }),
  });
}

export interface TestConnectionResult {
  success: boolean;
  error?: string;
  sampleColumns?: string[];
}

export function useTestDataConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<TestConnectionResult>(`/api/imports/connections/${id}/test`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["imports", "connections"] }),
  });
}

export function useFetchImportBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: number) =>
      apiRequest<{ batch: ImportBatch; sourceColumns: string[] }>(
        `/api/imports/connections/${connectionId}/import-batches`,
        { method: "POST" },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["imports", "batches"] }),
  });
}
