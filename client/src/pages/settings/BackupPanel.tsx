import { Alert, Badge, Code, Group, Loader, Stack, Text } from "@mantine/core";
import { useBackupStatus } from "../../api/settings";

function formatTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "never";
}

/** Backup status as reported by the operator's backup job. The app takes no backups itself. */
export function BackupPanel() {
  const { data, isLoading } = useBackupStatus();
  if (isLoading || !data) return <Loader />;

  return (
    <Stack gap="md" maw={640}>
      <Text size="sm" c="dimmed">
        OutcomeLink does not back itself up — a backup stored on the same server would be lost with
        it. Run a scheduled database backup at the server level and have it report here, so a missed
        or failed backup is noticed.
      </Text>

      {!data.configured ? (
        <Alert color="yellow" title="Backup reporting is not set up">
          Set <Code>BACKUP_CHECKIN_TOKEN</Code> (16 or more characters) in the server environment
          and add a report step to your backup job, as shown below. Until then this page can't say
          whether backups are happening.
        </Alert>
      ) : (
        <>
          <Group>
            {data.needsAttention ? (
              <Badge color="red" size="lg">
                Needs attention
              </Badge>
            ) : data.lastCheckin ? (
              <Badge color="green" size="lg">
                Backups are current
              </Badge>
            ) : (
              <Badge color="gray" size="lg">
                Waiting for the first report
              </Badge>
            )}
          </Group>
          {data.reason && <Alert color="red">{data.reason}</Alert>}
          <Stack gap={2}>
            <Text size="sm">
              <b>Last successful backup:</b> {formatTime(data.lastSuccessAt)}
            </Text>
            {data.lastCheckin && (
              <Text size="sm">
                <b>Latest report:</b>{" "}
                {data.lastCheckin.status === "SUCCESS" ? "succeeded" : "failed"} on{" "}
                {formatTime(data.lastCheckin.createdAt)}
                {data.lastCheckin.sizeMb !== null ? ` (${data.lastCheckin.sizeMb} MB)` : ""}
                {data.lastCheckin.note ? ` — ${data.lastCheckin.note}` : ""}
              </Text>
            )}
            <Text size="sm" c="dimmed">
              A backup counts as stale after {data.staleAfterHours} hours without a success. System
              Administrators are notified once a day while it stays that way.
            </Text>
          </Stack>
        </>
      )}

      <Stack gap={4}>
        <Text size="sm" fw={500}>
          Reporting from your backup job
        </Text>
        <Code block>{`# after the backup finishes (example):
curl -fsS -X POST https://YOUR-APP/api/system/backup-checkin \\
  -H "Authorization: Bearer $BACKUP_CHECKIN_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"status":"SUCCESS","sizeMb":512,"note":"nightly dump"}'`}</Code>
        <Text size="xs" c="dimmed">
          Send <Code>"status":"FAILED"</Code> with a note when the backup fails.
        </Text>
      </Stack>
    </Stack>
  );
}
