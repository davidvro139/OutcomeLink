import { Badge, Button, Group, Paper, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { downloadReportExportJob, useReportExportJobs } from "../../api/reportExportJobs";

const STATUS_COLORS = { PENDING: "yellow", SUCCESS: "green", FAILED: "red" } as const;

/**
 * Report pagination and bounded exports (docs/TODO.md): recent queued
 * exports for the current user — a report too large to download in the
 * request that asked for it. Only renders once at least one job exists.
 */
export function ExportJobsPanel() {
  const { data: jobs } = useReportExportJobs();
  if (!jobs || jobs.length === 0) return null;

  async function handleDownload(jobId: number) {
    try {
      await downloadReportExportJob(jobId);
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to download export",
        color: "red",
      });
    }
  }

  return (
    <Paper withBorder p="md">
      <Stack gap="xs">
        <Text fw={500}>Export Jobs</Text>
        {jobs.slice(0, 5).map((job) => (
          <Group key={job.id} justify="space-between">
            <Group gap="sm">
              <Badge color={STATUS_COLORS[job.status]}>{job.status}</Badge>
              <Text size="sm">{new Date(job.createdAt).toLocaleString()}</Text>
              {job.status === "SUCCESS" && job.rowCount !== null && (
                <Text size="sm" c="dimmed">
                  {job.rowCount.toLocaleString()} rows
                </Text>
              )}
              {job.status === "FAILED" && job.errorMessage && (
                <Text size="sm" c="red">
                  {job.errorMessage}
                </Text>
              )}
            </Group>
            {job.status === "SUCCESS" && (
              <Button size="xs" variant="light" onClick={() => handleDownload(job.id)}>
                Download
              </Button>
            )}
          </Group>
        ))}
      </Stack>
    </Paper>
  );
}
