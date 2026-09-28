import { PieChart } from "@mantine/charts";
import {
  Anchor,
  Badge,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { Link } from "react-router-dom";
import { useEmployerAnalytics } from "../../api/employers";
import { useReportingPeriods } from "../../api/accreditation";
import { useState } from "react";

const RISK_COLORS: Record<string, string> = { LOW: "green", MODERATE: "yellow", HIGH: "red" };
const PIE_COLORS = ["blue.6", "teal.6", "grape.6", "orange.6", "cyan.6", "pink.6", "lime.6", "indigo.6"];

/** Phase 2 P5 (docs/TODO.md): top employers, concentration risk, and industry breakdown. */
export function EmployerAnalyticsPage() {
  const [reportingPeriodId, setReportingPeriodId] = useState<number | undefined>(undefined);
  const { data: periods } = useReportingPeriods();
  const { data, isLoading } = useEmployerAnalytics(reportingPeriodId);

  return (
    <Stack p="xl" gap="md">
      <Title order={2}>Employer Relationship Analytics</Title>
      <Text c="dimmed" size="sm">
        Which employers are actually hiring graduates, and how dependent the institution is on a
        small number of them.
      </Text>

      <Select
        label="Reporting period"
        placeholder="All time"
        clearable
        data={periods?.map((p) => ({ value: String(p.id), label: p.label })) ?? []}
        value={reportingPeriodId ? String(reportingPeriodId) : null}
        onChange={(v) => setReportingPeriodId(v ? Number(v) : undefined)}
        w={280}
      />

      {isLoading && <Loader />}

      {data && (
        <>
          <SimpleGrid cols={{ base: 1, sm: 4 }}>
            <Paper withBorder p="md" radius="md">
              <Text size="xs" c="dimmed" tt="uppercase">
                Total Placements
              </Text>
              <Title order={2}>{data.concentration.totalPlacements}</Title>
            </Paper>
            <Paper withBorder p="md" radius="md">
              <Text size="xs" c="dimmed" tt="uppercase">
                Distinct Employers
              </Text>
              <Title order={2}>{data.concentration.distinctEmployerCount}</Title>
            </Paper>
            <Paper withBorder p="md" radius="md">
              <Text size="xs" c="dimmed" tt="uppercase">
                Top Employer Share
              </Text>
              <Title order={2}>{data.concentration.topEmployerShare}%</Title>
            </Paper>
            <Paper withBorder p="md" radius="md">
              <Text size="xs" c="dimmed" tt="uppercase">
                Concentration Risk
              </Text>
              <Badge color={RISK_COLORS[data.concentration.risk]} size="lg" mt={4}>
                {data.concentration.risk}
              </Badge>
            </Paper>
          </SimpleGrid>

          {data.topEmployers.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              No employed outcomes on file for this selection yet.
            </Text>
          ) : (
            <Group align="flex-start" gap="xl" wrap="wrap">
              <Table striped highlightOnHover style={{ flex: 2, minWidth: 320 }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Employer</Table.Th>
                    <Table.Th>Industry</Table.Th>
                    <Table.Th>Placements</Table.Th>
                    <Table.Th>Related</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.topEmployers.map((row) => (
                    <Table.Tr key={row.employer.id}>
                      <Table.Td>
                        <Anchor component={Link} to={`/employers/${row.employer.id}`}>
                          {row.employer.name}
                        </Anchor>
                      </Table.Td>
                      <Table.Td>{row.employer.industry ?? "—"}</Table.Td>
                      <Table.Td>{row.placementCount}</Table.Td>
                      <Table.Td>{row.relatedPlacementCount}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>

              <Stack style={{ flex: 1, minWidth: 280 }}>
                <Text fw={500} size="sm">
                  Placements by Industry
                </Text>
                <PieChart
                  data={data.industryBreakdown.map((row, i) => ({
                    name: row.industry,
                    value: row.placementCount,
                    color: PIE_COLORS[i % PIE_COLORS.length],
                  }))}
                  withLabels
                  withTooltip
                  size={220}
                />
              </Stack>
            </Group>
          )}
        </>
      )}
    </Stack>
  );
}
