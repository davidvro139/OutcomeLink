import { CPL_METRICS } from "@outcomelink/shared";
import { Alert, Anchor, Badge, Button, Group, Loader, Paper, SimpleGrid, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useReadiness, useSetOutcomesDeadline } from "../../api/accreditation";
import { formatDateOnly } from "../../lib/dates";

const CAN_SET_DEADLINE = ["SYSTEM_ADMINISTRATOR", "INSTITUTIONAL_ADMINISTRATOR"];

function OutcomesDeadlineBanner({
  reportingPeriodId,
  outcomesDeadline,
  daysUntilOutcomesDeadline,
}: {
  reportingPeriodId: number;
  outcomesDeadline: string | null;
  daysUntilOutcomesDeadline: number | null;
}) {
  const { user } = useAuth();
  const canEdit = user && CAN_SET_DEADLINE.includes(user.role);
  const setDeadline = useSetOutcomesDeadline(reportingPeriodId);
  const [editing, { toggle: toggleEditing, close: closeEditing }] = useDisclosure(false);
  const [draft, setDraft] = useState(outcomesDeadline?.slice(0, 10) ?? "");

  async function handleSave() {
    try {
      await setDeadline.mutateAsync(draft || null);
      notifications.show({ message: "Outcomes deadline updated", color: "green" });
      closeEditing();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to update deadline",
        color: "red",
      });
    }
  }

  if (editing) {
    return (
      <Group>
        <TextInput
          type="date"
          label="Outcomes deadline"
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          w={200}
        />
        <Button size="xs" mt={22} onClick={handleSave} loading={setDeadline.isPending}>
          Save
        </Button>
        <Button size="xs" mt={22} variant="subtle" onClick={closeEditing}>
          Cancel
        </Button>
      </Group>
    );
  }

  if (!outcomesDeadline) {
    return canEdit ? (
      <Button size="xs" variant="light" onClick={toggleEditing}>
        Set Outcomes Deadline
      </Button>
    ) : null;
  }

  const days = daysUntilOutcomesDeadline ?? 0;
  const color = days < 0 ? "red" : days <= 7 ? "orange" : days <= 30 ? "yellow" : "blue";
  const deadlineDate = formatDateOnly(outcomesDeadline);
  const message =
    days < 0
      ? `Outcomes deadline was ${deadlineDate} — ${-days} day${-days === 1 ? "" : "s"} overdue`
      : days === 0
        ? `Outcomes deadline is today (${deadlineDate})`
        : `Outcomes deadline: ${deadlineDate} — ${days} day${days === 1 ? "" : "s"} remaining`;

  return (
    <Alert color={color} variant="light">
      <Group justify="space-between">
        <Text size="sm">{message}</Text>
        {canEdit && (
          <Button size="xs" variant="subtle" onClick={toggleEditing}>
            Edit
          </Button>
        )}
      </Group>
    </Alert>
  );
}

/** Phase 2 P2 (docs/TODO.md): per-program "would this pass review right now" rollup. */
export function ReadinessTab({ reportingPeriodId }: { reportingPeriodId: number }) {
  const { data, isLoading } = useReadiness(reportingPeriodId);

  if (isLoading) return <Loader m="xl" />;
  if (!data) return null;

  return (
    <Stack gap="md">
      <OutcomesDeadlineBanner
        reportingPeriodId={reportingPeriodId}
        outcomesDeadline={data.summary.outcomesDeadline}
        daysUntilOutcomesDeadline={data.summary.daysUntilOutcomesDeadline}
      />

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed" tt="uppercase">
            Programs Ready
          </Text>
          <Title order={2}>
            {data.summary.readyPrograms} / {data.summary.totalPrograms}
          </Title>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed" tt="uppercase">
            Programs With Open Issues
          </Text>
          <Title order={2}>{data.summary.programsWithOpenIssues}</Title>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed" tt="uppercase">
            Not Ready
          </Text>
          <Title order={2}>{data.summary.totalPrograms - data.summary.readyPrograms}</Title>
        </Paper>
      </SimpleGrid>

      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Program</Table.Th>
            {CPL_METRICS.map((metric) => (
              <Table.Th key={metric}>{metric}</Table.Th>
            ))}
            <Table.Th>Open Issues</Table.Th>
            <Table.Th>Status</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.readiness.map((row) => (
            <Table.Tr key={row.program.id}>
              <Table.Td>
                <Anchor component={Link} to={`/programs/${row.program.id}`}>
                  {row.program.name}
                </Anchor>
              </Table.Td>
              {CPL_METRICS.map((metric) => {
                const m = row.metrics[metric];
                if (!m) return <Table.Td key={metric}>—</Table.Td>;
                return (
                  <Table.Td key={metric}>
                    <Group gap={4} wrap="nowrap">
                      <Badge color={m.meetsBenchmark ? "green" : "red"} variant="light">
                        {m.denominator > 0 ? `${m.percentage}%` : "N/A"}
                      </Badge>
                      {m.negotiated && (
                        <Badge color="grape" size="xs" variant="outline">
                          negotiated {m.benchmark}%
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                );
              })}
              <Table.Td>
                {row.openIssueCount > 0 ? (
                  <Badge color="yellow">{row.openIssueCount}</Badge>
                ) : (
                  <Text size="sm">0</Text>
                )}
              </Table.Td>
              <Table.Td>
                <Badge color={row.ready ? "green" : "red"}>{row.ready ? "Ready" : "Not Ready"}</Badge>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      {data.readiness.length === 0 && (
        <Text c="dimmed" ta="center" py="xl">
          No CPL results computed for this period yet — run Compute first.
        </Text>
      )}
    </Stack>
  );
}
