import { Alert, Box, Button, Group, Select, Stack, Table, Text, Title } from "@mantine/core";
import { IconDownload } from "@tabler/icons-react";
import { EQUITY_DIMENSION_LABELS, EQUITY_DIMENSIONS } from "@outcomelink/shared";
import type { CplMetric, EquityDimension } from "@outcomelink/shared";
import { useMemo, useState } from "react";
import { SortableTableHeader } from "../../components/SortableTableHeader";
import type { SortDirection } from "../../lib/sorting";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { downloadEquityBreakdown, useEquityBreakdown, type EquityBreakdownParams } from "../../api/equity";
import { usePrograms } from "../../api/programs";
import { notifications } from "@mantine/notifications";

const STATUS_LABELS: Record<string, string> = {
  MEETING: "Meeting benchmark",
  BELOW_BENCHMARK: "Below benchmark",
  SUPPRESSED: "Suppressed",
  NO_DATA: "No data",
};

function percentageText(group: { suppressed: boolean; percentage: number | null }): string {
  if (group.suppressed) return "Suppressed (n<10)";
  if (group.percentage != null) return `${group.percentage}%`;
  return "N/A";
}

const METRICS = ["COMPLETION", "PLACEMENT", "LICENSURE"] as const;
const METRIC_LABELS: Record<CplMetric, string> = {
  COMPLETION: "Completion",
  PLACEMENT: "Placement",
  LICENSURE: "Licensure",
};

export function EquityBreakdownPage() {
  const [metric, setMetric] = useState<CplMetric>("COMPLETION");
  const [dimension, setDimension] = useState<EquityDimension>("entryYear");
  const [programId, setProgramId] = useState<number | null>(null);
  const [sortField, setSortField] = useState<string | null>("label");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const { data: programData } = usePrograms();
  const programs = programData?.items ?? [];

  const params: EquityBreakdownParams = useMemo(() => {
    return { metric, dimension, programId: programId ?? undefined };
  }, [metric, dimension, programId]);

  const { data: breakdown, isLoading } = useEquityBreakdown(params);

  const handleSort = (field: string, direction: SortDirection) => {
    setSortField(field);
    setSortDirection(direction);
  };

  const sortedGroups = useMemo(() => {
    if (!breakdown?.groups) return [];
    const groups = [...breakdown.groups];
    if (!sortField) return groups;

    return groups.sort((a, b) => {
      let aVal = a[sortField as keyof typeof a];
      let bVal = b[sortField as keyof typeof b];

      if (aVal === null || aVal === undefined) aVal = "";
      if (bVal === null || bVal === undefined) bVal = "";

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }

      return 0;
    });
  }, [breakdown?.groups, sortField, sortDirection]);

  if (isLoading) return <Text>Loading...</Text>;

  if (!breakdown) return <Alert>No data available</Alert>;

  const handleDownload = async () => {
    try {
      const label = `${dimension}-${metric}-${new Date().toISOString().slice(0, 10)}`;
      await downloadEquityBreakdown(params, label);
      notifications.show({ color: "green", message: "Downloaded equity report" });
    } catch {
      notifications.show({ color: "red", message: "Failed to download report" });
    }
  };

  return (
    <Stack p="xl" gap="lg">
      <div>
        <Title order={1} size="h2">Cohort & Equity Breakdown</Title>
        <Text size="sm" c="dimmed">Compare outcomes across student groups</Text>
      </div>

      {/* Selectors */}
      <Group grow gap="lg">
        <Select
          label="Reporting Period"
          placeholder="Latest"
          value={breakdown.period?.id.toString()}
          disabled
        />
        <Select
          label="Metric"
          placeholder="Choose metric"
          data={METRICS.map((m) => ({ label: METRIC_LABELS[m], value: m }))}
          value={metric}
          onChange={(v) => v && setMetric(v as CplMetric)}
        />
        <Select
          label="Disaggregate by"
          placeholder="Choose dimension"
          data={EQUITY_DIMENSIONS.map((d) => ({
            label: EQUITY_DIMENSION_LABELS[d],
            value: d,
          }))}
          value={dimension}
          onChange={(v) => v && setDimension(v as EquityDimension)}
        />
        <Select
          label="Program"
          placeholder="All accessible programs"
          data={[
            { label: "All accessible programs", value: "" },
            ...programs.map((p) => ({ label: p.name, value: String(p.id) })),
          ]}
          value={programId?.toString() ?? ""}
          onChange={(v) => setProgramId(v ? Number(v) : null)}
        />
      </Group>

      {/* Freshness note */}
      {breakdown.period && (
        <Text size="xs" c="dimmed">
          Results computed on {new Date(breakdown.period.endDate).toLocaleDateString()}
        </Text>
      )}

      {/* Coverage note for demographics */}
      {breakdown.coverage && (
        <Alert>
          {breakdown.coverage.withDataOnFile} of {breakdown.coverage.totalDenominator} students have
          this demographic field on file.
        </Alert>
      )}

      {/* Groups table */}
      <Box>
        <Title order={3}>Current Period Results</Title>
        {breakdown.groups.length === 0 ? (
          <Text>No data for this breakdown</Text>
        ) : (
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>
                  <SortableTableHeader
                    field="label"
                    label="Group"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                </Table.Th>
                <Table.Th ta="right">
                  <SortableTableHeader
                    field="denominator"
                    label="Denominator"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    align="right"
                  />
                </Table.Th>
                <Table.Th ta="right">
                  <SortableTableHeader
                    field="numerator"
                    label="Numerator"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    align="right"
                  />
                </Table.Th>
                <Table.Th ta="right">
                  <SortableTableHeader
                    field="percentage"
                    label="Percentage"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    align="right"
                  />
                </Table.Th>
                <Table.Th>
                  <SortableTableHeader
                    field="status"
                    label="Status"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sortedGroups.map((g) => (
                <Table.Tr key={g.value}>
                  <Table.Td>{g.label}</Table.Td>
                  <Table.Td ta="right">{g.denominator}</Table.Td>
                  <Table.Td ta="right">{g.suppressed ? "Suppressed" : g.numerator}</Table.Td>
                  <Table.Td ta="right">{percentageText(g)}</Table.Td>
                  <Table.Td>{STATUS_LABELS[g.status] ?? g.status}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Box>

      {/* Trend chart */}
      {breakdown.trend.length > 0 && (
        <Box>
          <Title order={3}>Trend over periods</Title>
          <Text size="sm" c="dimmed">Success rate by group across reporting periods</Text>
          <Box style={{ height: 400, marginTop: 16 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={
                  breakdown.trend[0]?.points.map((_, idx) => ({
                    period: breakdown.trend[0]?.points[idx]?.label || `Period ${idx + 1}`,
                    ...(breakdown.trend.map((series) => ({
                      [series.label]: series.points[idx]?.percentage ?? null,
                    })).reduce((acc, obj) => ({ ...acc, ...obj }), {})),
                    benchmark: breakdown.trend[0]?.points[idx]?.benchmark,
                  })) || []
                }
                margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis label={{ value: "Success Rate (%)", angle: -90, position: "insideLeft" }} />
                <Tooltip formatter={(value) => (typeof value === "number" ? `${value.toFixed(1)}%` : "N/A")} />
                <Legend />
                {breakdown.trend.map((series, idx) => (
                  <Line
                    key={series.label}
                    type="monotone"
                    dataKey={series.label}
                    stroke={[
                      "#1f77b4",
                      "#ff7f0e",
                      "#2ca02c",
                      "#d62728",
                      "#9467bd",
                      "#8c564b",
                    ][idx % 6]}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
                {breakdown.benchmark && (
                  <ReferenceLine
                    y={breakdown.benchmark.value}
                    stroke="#666"
                    strokeDasharray="5 5"
                    label={{ value: `Benchmark: ${breakdown.benchmark.value.toFixed(1)}%`, position: "right" }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </Box>
      )}

      {/* Export button */}
      <Group>
        <Button
          leftSection={<IconDownload size={16} />}
          onClick={handleDownload}
        >
          Export to Excel
        </Button>
      </Group>
    </Stack>
  );
}
