import { RETENTION_LABELS, type RetentionSettings } from "@outcomelink/shared";
import { Alert, Button, Group, Loader, NumberInput, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { describeSaveError } from "../../lib/formErrors";
import {
  useRetentionSettings,
  useRunRetentionNow,
  useSaveRetentionSettings,
} from "../../api/settings";

const HELP: Record<keyof RetentionSettings, string> = {
  jobRunDays:
    "Finished background-job records, scheduled-report runs and export records. Older ones are deleted.",
  emailLogDays: "The record of emails sent. Older entries are deleted.",
  notificationDays:
    "Notifications a person has already read, counted from when they read them. Unread ones are never deleted.",
  exportFileDays:
    "The generated Excel files behind scheduled reports and exports. The file is deleted; its record stays until the job-history window above.",
};

const FIELDS: (keyof RetentionSettings)[] = [
  "jobRunDays",
  "emailLogDays",
  "notificationDays",
  "exportFileDays",
];

/** How long operational records are kept. The audit log, evidence and student records are never cleaned up. */
export function RetentionPanel() {
  const { data, isLoading } = useRetentionSettings();
  const save = useSaveRetentionSettings();
  const runNow = useRunRetentionNow();
  const [values, setValues] = useState<Record<keyof RetentionSettings, number | string> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data) setValues({ ...data.retention });
  }, [data]);

  if (isLoading || !data || !values) return <Loader />;

  async function handleSave() {
    setError(null);
    try {
      await save.mutateAsync({
        jobRunDays: Number(values!.jobRunDays),
        emailLogDays: Number(values!.emailLogDays),
        notificationDays: Number(values!.notificationDays),
        exportFileDays: Number(values!.exportFileDays),
      });
      notifications.show({ message: "Retention settings saved", color: "green" });
    } catch (err) {
      setError(describeSaveError(err));
    }
  }

  async function handleRun() {
    try {
      const { result } = await runNow.mutateAsync();
      const total =
        result.jobRuns +
        result.scheduledReportRuns +
        result.reportExportJobs +
        result.emailDeliveries +
        result.notifications;
      notifications.show({
        message: `Cleanup finished: ${total} record${total === 1 ? "" : "s"} and ${result.filesRemoved} file${result.filesRemoved === 1 ? "" : "s"} removed.`,
        color: "green",
      });
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Cleanup failed",
        color: "red",
      });
    }
  }

  return (
    <Stack gap="md" maw={560}>
      <Text size="sm" c="dimmed">
        A cleanup runs every night and removes operational records older than these limits. Audit
        history, evidence and everything about students, enrollments and outcomes is never removed.
      </Text>

      {FIELDS.map((field) => (
        <NumberInput
          key={field}
          label={RETENTION_LABELS[field]}
          description={HELP[field]}
          suffix=" days"
          min={data.limits.min}
          max={data.limits.max}
          allowDecimal={false}
          value={values[field]}
          onChange={(v) => setValues({ ...values, [field]: v })}
          rightSectionWidth={110}
          rightSection={
            <Text size="xs" c="dimmed" pr="xs">
              default {data.defaults[field]}
            </Text>
          }
        />
      ))}

      {error && <Alert color="red">{error}</Alert>}

      <Group>
        <Button onClick={handleSave} loading={save.isPending}>
          Save
        </Button>
        <Button variant="light" onClick={handleRun} loading={runNow.isPending}>
          Run cleanup now
        </Button>
      </Group>
    </Stack>
  );
}
