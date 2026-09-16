import { CPL_METRICS } from "@outcomelink/shared";
import { Anchor, Badge, Group, Loader, Paper, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";
import { useReadiness } from "../../api/accreditation";

/** Phase 2 P2 (docs/TODO.md): per-program "would this pass review right now" rollup. */
export function ReadinessTab({ reportingPeriodId }: { reportingPeriodId: number }) {
  const { data, isLoading } = useReadiness(reportingPeriodId);

  if (isLoading) return <Loader m="xl" />;
  if (!data) return null;

  return (
    <Stack gap="md">
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
