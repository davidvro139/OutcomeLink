import type { RetentionSettings } from "@outcomelink/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/apiClient";

export type MailSource = "institution" | "server" | "none";

export interface EmailSettingsView {
  source: MailSource;
  serverDefaultAvailable: boolean;
  canEdit: boolean;
  settings: {
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    mailFrom: string;
    /** The password itself is never sent to the browser. */
    passwordSet: boolean;
  };
}

export interface SaveEmailSettingsInput {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  /** Blank keeps the stored password. */
  smtpPassword: string;
  clearPassword: boolean;
  mailFrom: string;
}

const EMAIL_KEY = ["settings", "email"];

export function useEmailSettings() {
  return useQuery({
    queryKey: EMAIL_KEY,
    queryFn: () => apiRequest<EmailSettingsView>("/api/settings/email"),
  });
}

function useInvalidateEmail() {
  const queryClient = useQueryClient();
  // The "is email on?" check used by the user menu and Email log depends on these settings too.
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: EMAIL_KEY }),
      queryClient.invalidateQueries({ queryKey: ["email-deliveries", "status"] }),
    ]);
}

export function useSaveEmailSettings() {
  const invalidate = useInvalidateEmail();
  return useMutation({
    mutationFn: (input: SaveEmailSettingsInput) =>
      apiRequest<EmailSettingsView>("/api/settings/email", {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useResetEmailSettings() {
  const invalidate = useInvalidateEmail();
  return useMutation({
    mutationFn: () => apiRequest<EmailSettingsView>("/api/settings/email", { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export interface TestEmailResult {
  status: "SENT" | "FAILED" | "SKIPPED";
  reason?: string;
  to: string;
}

export function useSendTestEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<TestEmailResult>("/api/settings/email/test", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["email-deliveries"] }),
  });
}

export interface RetentionView {
  retention: RetentionSettings;
  defaults: RetentionSettings;
  limits: { min: number; max: number };
}

export function useRetentionSettings() {
  return useQuery({
    queryKey: ["settings", "retention"],
    queryFn: () => apiRequest<RetentionView>("/api/settings/retention"),
  });
}

export function useSaveRetentionSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RetentionSettings) =>
      apiRequest<RetentionView>("/api/settings/retention", {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings", "retention"] }),
  });
}

export interface RetentionRunResult {
  jobRuns: number;
  scheduledReportRuns: number;
  reportExportJobs: number;
  emailDeliveries: number;
  notifications: number;
  filesRemoved: number;
}

export function useRunRetentionNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<{ result: RetentionRunResult }>("/api/settings/retention/run", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["job-runs"] }),
  });
}

export interface BackupStatusView {
  configured: boolean;
  staleAfterHours: number;
  lastCheckin: {
    status: "SUCCESS" | "FAILED";
    note: string | null;
    sizeMb: number | null;
    createdAt: string;
  } | null;
  lastSuccessAt: string | null;
  needsAttention: boolean;
  reason: string | null;
}

export function useBackupStatus() {
  return useQuery({
    queryKey: ["settings", "backup-status"],
    queryFn: () => apiRequest<BackupStatusView>("/api/settings/backup-status"),
    refetchInterval: 60_000,
  });
}
