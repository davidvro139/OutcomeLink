import {
  JOB_RUN_STATUSES,
  JOB_TYPE_LABELS,
  JOB_TYPES,
  type JobRunStatus,
  type JobType,
} from "@outcomelink/shared";
import {
  Badge,
  Button,
  Group,
  Loader,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { type JobRun, useJobRuns, useRetryJobRun } from "../../api/jobRuns";
import { usePermissions } from "../../auth/usePermissions";
import { EmailLogPanel } from "./EmailLogPanel";
import { Pager } from "../../components/Pager";

const STATUS_COLORS: Record<JobRunStatus, string> = {
  RUNNING: "blue",
  RETRY_PENDING: "yellow",
  SUCCESS: "green",
  FAILED: "red",
};

const STATUS_LABELS: Record<JobRunStatus, string> = {
  RUNNING: "Running",
  RETRY_PENDING: "Retrying",
  SUCCESS: "Succeeded",
  FAILED: "Failed",
};

function formatTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

/** A one-line, human summary of what a finished job did, from its result counts. */
function summarize(run: JobRun): string {
  if (run.status === "FAILED" || run.status === "RETRY_PENDING") return run.errorMessage ?? "";
  if (!run.result) return "";
  const entries = Object.entries(run.result).filter(
    ([, v]) => typeof v === "number" || typeof v === "string",
  );
  return entries.map(([k, v]) => `${k.replace(/([A-Z])/g, " $1").toLowerCase()}: ${v}`).join(", ");
}

/** Job History (docs/TODO.md's reusable scheduled-job infrastructure): every scheduled or manual background run, its attempts, and a retry for failures. */
function JobRunsPanel() {
  const { canAdminister } = usePermissions();
  const [jobType, setJobType] = useState<JobType | null>(null);
  const [status, setStatus] = useState<JobRunStatus | null>(null);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useJobRuns(
    { jobType: jobType ?? undefined, status: status ?? undefined, page },
    canAdminister,
  );
  const retry = useRetryJobRun();

  if (!canAdminister) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        You don't have access to this page.
      </Text>
    );
  }

  async function handleRetry(run: JobRun) {
    try {
      const result = await retry.mutateAsync(run.id);
      notifications.show({
        message:
          result.run.status === "SUCCESS"
            ? "Retry succeeded"
            : "Retry failed — see the error in the list",
        color: result.run.status === "SUCCESS" ? "green" : "red",
      });
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to retry",
        color: "red",
      });
    }
  }

  return (
    <Stack gap="md">
      <Text c="dimmed" size="sm">
        Scheduled and manually-run background jobs. A scheduled job that fails is retried
        automatically with a growing delay; a manual run that fails can be retried here.
      </Text>

      <Group>
        <Select
          label="Job"
          placeholder="All jobs"
          clearable
          w={260}
          data={JOB_TYPES.map((t) => ({ value: t, label: JOB_TYPE_LABELS[t] }))}
          value={jobType}
          onChange={(v) => {
            setJobType(v as JobType | null);
            setPage(1);
          }}
        />
        <Select
          label="Status"
          placeholder="Any status"
          clearable
          w={180}
          data={JOB_RUN_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
          value={status}
          onChange={(v) => {
            setStatus(v as JobRunStatus | null);
            setPage(1);
          }}
        />
      </Group>

      {isLoading && <Loader />}

      {data && data.items.length === 0 && (
        <Text c="dimmed" ta="center" py="xl">
          {jobType || status ? "No runs match these filters." : "No job runs yet."}
        </Text>
      )}

      {data && data.items.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Job</Table.Th>
              <Table.Th>Trigger</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Attempt</Table.Th>
              <Table.Th>Started</Table.Th>
              <Table.Th>Finished / next try</Table.Th>
              <Table.Th>Details</Table.Th>
              <Table.Th></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.items.map((run) => (
              <Table.Tr key={run.id}>
                <Table.Td>{JOB_TYPE_LABELS[run.jobType] ?? run.jobType}</Table.Td>
                <Table.Td>{run.trigger === "MANUAL" ? "Manual" : "Scheduled"}</Table.Td>
                <Table.Td>
                  <Badge color={STATUS_COLORS[run.status]}>{STATUS_LABELS[run.status]}</Badge>
                </Table.Td>
                <Table.Td>
                  {run.attempt} of {run.maxAttempts}
                </Table.Td>
                <Table.Td>{formatTime(run.startedAt)}</Table.Td>
                <Table.Td>
                  {run.status === "RETRY_PENDING"
                    ? `Next try ${formatTime(run.nextAttemptAt)}`
                    : formatTime(run.finishedAt)}
                </Table.Td>
                <Table.Td maw={360}>
                  <Tooltip
                    label={summarize(run)}
                    disabled={summarize(run).length < 60}
                    multiline
                    maw={420}
                  >
                    <Text size="sm" lineClamp={2} c={run.status === "FAILED" ? "red" : undefined}>
                      {summarize(run) || "—"}
                    </Text>
                  </Tooltip>
                </Table.Td>
                <Table.Td>
                  {run.status === "FAILED" && (
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() => handleRetry(run)}
                      loading={retry.isPending && retry.variables === run.id}
                    >
                      Retry
                    </Button>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {data && data.pagination.totalPages > 1 && (
        <Pager total={data.pagination.totalPages} value={page} onChange={setPage} />
      )}
    </Stack>
  );
}

/** Job History and the email log — the delivery history for everything the app does in the background or sends out. */
export function JobHistoryPage() {
  const { canAdminister } = usePermissions();
  if (!canAdminister) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        You don't have access to this page.
      </Text>
    );
  }
  return (
    <Stack p="xl" gap="md">
      <Title order={2}>Job History</Title>
      <Tabs defaultValue="jobs" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="jobs">Jobs</Tabs.Tab>
          <Tabs.Tab value="email">Email log</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="jobs" pt="md">
          <JobRunsPanel />
        </Tabs.Panel>
        <Tabs.Panel value="email" pt="md">
          <EmailLogPanel />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
