import { CPL_METRICS, type CplMetric } from "@outcomelink/shared";
import { LineChart } from "@mantine/charts";
import {
  Alert,
  Anchor,
  Badge,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconArrowDown, IconArrowUp, IconMinus } from "@tabler/icons-react";
import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useReadiness, useReportingPeriods, useTrends, type ReadinessMetric } from "../../api/accreditation";
import { useEmployerAnalytics } from "../../api/employers";
import { useFollowUpQueue } from "../../api/followups";
import { useLicensureQueue } from "../../api/licensure";
import { formatDateOnly } from "../../lib/dates";
import { METRIC_LABELS } from "./riskDisplay";

const RISK_COLORS: Record<string, string> = { LOW: "green", MODERATE: "yellow", HIGH: "red" };

const TREND_SERIES = [
  { name: "COMPLETION", color: "blue.6" },
  { name: "PLACEMENT", color: "teal.6" },
  { name: "LICENSURE", color: "grape.6" },
];

function deadlinePhrase(iso: string, days: number | null): string {
  const date = formatDateOnly(iso);
  if (days === null) return `Outcomes due ${date}`;
  if (days < 0) return `Outcomes deadline was ${date}`;
  if (days === 0) return `Outcomes deadline is today (${date})`;
  return `Outcomes due ${date} — ${days} day${days === 1 ? "" : "s"} left`;
}

function LinkedStat({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Paper
      component={Link}
      to={to}
      withBorder
      p="md"
      radius="md"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      {children}
    </Paper>
  );
}

/**
 * Phase 2 P6 (docs/TODO.md): the institution's own top-level "how are we
 * doing" view — current-period rates, whether they're trending up or down,
 * how exposed the institution is to a small number of employers, and how
 * much operational work is outstanding. Rates, the trend, the shortfall list,
 * and concentration are the same payloads as Readiness, Trends, and Employer
 * Analytics (all-time, which is that page's default). Follow-ups overdue is
 * the unresolved-outcome worklist with "minimum days overdue" set to 1; the
 * student total under it is that worklist with no overdue filter. The
 * licensure count is that queue's length.
 */
export function ExecutiveDashboard() {
  const { data: periods, isLoading: periodsLoading } = useReportingPeriods();
  const currentPeriod = periods?.[0];
  const { data: readiness, isLoading: readinessLoading } = useReadiness(currentPeriod?.id);
  const { data: trends } = useTrends(undefined);
  const { data: employerAnalytics } = useEmployerAnalytics(undefined);
  const { data: followUpQueue } = useFollowUpQueue({});
  const { data: followUpsOverdue } = useFollowUpQueue({ minDaysOverdue: 1 });
  const { data: licensureQueue } = useLicensureQueue();

  const trendByMetric = useMemo(() => {
    if (!trends) return {};
    const withData = trends.filter((t) => Object.keys(t.metrics).length > 0);
    const latest = withData[withData.length - 1];
    const previous = withData[withData.length - 2];
    if (!latest || !previous) return {};
    const result: Partial<Record<string, number>> = {};
    for (const metric of CPL_METRICS) {
      const latestPct = latest.metrics[metric]?.percentage;
      const previousPct = previous.metrics[metric]?.percentage;
      if (latestPct !== undefined && previousPct !== undefined) {
        result[metric] = Math.round((latestPct - previousPct) * 10) / 10;
      }
    }
    return result;
  }, [trends]);

  const trendChart = useMemo(
    () =>
      trends
        ?.filter((point) => Object.keys(point.metrics).length > 0)
        .map((point) => ({
          period: point.reportingPeriod.label,
          COMPLETION: point.metrics.COMPLETION?.percentage ?? null,
          PLACEMENT: point.metrics.PLACEMENT?.percentage ?? null,
          LICENSURE: point.metrics.LICENSURE?.percentage ?? null,
        })) ?? [],
    [trends],
  );

  const shortfalls = useMemo(() => {
    if (!readiness) return [];
    const rows: {
      programId: number;
      programName: string;
      metric: CplMetric;
      metricResult: ReadinessMetric;
    }[] = [];
    for (const row of readiness.readiness) {
      for (const metric of CPL_METRICS) {
        const metricResult = row.metrics[metric];
        if (!metricResult || metricResult.denominator === 0 || metricResult.meetsBenchmark) continue;
        rows.push({ programId: row.program.id, programName: row.program.name, metric, metricResult });
      }
    }
    return rows.sort(
      (a, b) =>
        a.metricResult.percentage - a.metricResult.benchmark - (b.metricResult.percentage - b.metricResult.benchmark),
    );
  }, [readiness]);

  if (periodsLoading) return <Loader m="xl" />;
  if (!currentPeriod) {
    return (
      <Text c="dimmed" py="xl">
        No reporting periods exist yet.
      </Text>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="baseline">
        <Text size="sm" c="dimmed">
          Current period: <strong>{currentPeriod.label}</strong> ({currentPeriod.status})
        </Text>
        {readiness?.summary.outcomesDeadline && (
          <Text
            size="sm"
            c={
              (readiness.summary.daysUntilOutcomesDeadline ?? 0) < 0
                ? "red"
                : (readiness.summary.daysUntilOutcomesDeadline ?? 99) <= 30
                  ? "orange.8"
                  : "dimmed"
            }
          >
            {deadlinePhrase(readiness.summary.outcomesDeadline, readiness.summary.daysUntilOutcomesDeadline)}
          </Text>
        )}
      </Group>

      {readinessLoading && <Loader size="sm" />}

      {readiness && (
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          {CPL_METRICS.map((metric) => {
            const institutionRow = readiness.readiness.reduce(
              (acc, r) => {
                const m = r.metrics[metric];
                if (!m) return acc;
                return { numerator: acc.numerator + m.numerator, denominator: acc.denominator + m.denominator };
              },
              { numerator: 0, denominator: 0 },
            );
            const percentage =
              institutionRow.denominator > 0
                ? Math.round((institutionRow.numerator / institutionRow.denominator) * 10000) / 100
                : null;
            const delta = trendByMetric[metric];
            return (
              <Paper withBorder p="md" radius="md" key={metric}>
                <Text size="xs" c="dimmed" tt="uppercase">
                  {metric}
                </Text>
                <Group gap={6} align="baseline">
                  <Title order={2}>{percentage !== null ? `${percentage}%` : "N/A"}</Title>
                  {delta !== undefined && delta !== 0 && (
                    <Group gap={2}>
                      {delta > 0 ? (
                        <IconArrowUp size={16} color="var(--mantine-color-green-6)" />
                      ) : (
                        <IconArrowDown size={16} color="var(--mantine-color-red-6)" />
                      )}
                      <Text size="xs" c={delta > 0 ? "green" : "red"}>
                        {Math.abs(delta)} pts
                      </Text>
                    </Group>
                  )}
                  {delta === 0 && <IconMinus size={16} color="var(--mantine-color-dimmed)" />}
                </Group>
              </Paper>
            );
          })}
        </SimpleGrid>
      )}

      {trendChart.length > 1 && (
        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" mb="xs">
            <Text size="xs" c="dimmed" tt="uppercase">
              Institution trend
            </Text>
            <Anchor component={Link} size="sm" to="/accreditation/trends">
              Open trends
            </Anchor>
          </Group>
          <LineChart
            h={240}
            data={trendChart}
            dataKey="period"
            series={TREND_SERIES}
            curveType="monotone"
            withLegend
            yAxisProps={{ domain: [0, 100] }}
            unit="%"
          />
        </Paper>
      )}

      {readiness &&
        (shortfalls.length === 0 ? (
          <Alert color="green" title="Every program with data is meeting its benchmarks" />
        ) : (
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between" mb="xs">
              <Text size="xs" c="dimmed" tt="uppercase">
                Short of benchmark
              </Text>
              <Anchor component={Link} size="sm" to={`/accreditation/reporting-periods/${currentPeriod.id}?tab=readiness`}>
                Open readiness
              </Anchor>
            </Group>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Program</Table.Th>
                  <Table.Th>Metric</Table.Th>
                  <Table.Th>Rate</Table.Th>
                  <Table.Th>Benchmark</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {shortfalls.map((row) => (
                  <Table.Tr key={`${row.programId}-${row.metric}`}>
                    <Table.Td>
                      <Anchor component={Link} to={`/programs/${row.programId}`}>
                        {row.programName}
                      </Anchor>
                    </Table.Td>
                    <Table.Td>{METRIC_LABELS[row.metric]}</Table.Td>
                    <Table.Td>
                      <Badge color="red" variant="light">
                        {row.metricResult.percentage}%
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={6}>
                        <Text size="sm">{row.metricResult.benchmark}%</Text>
                        {row.metricResult.negotiated && (
                          <Badge color="grape" size="xs" variant="outline">
                            negotiated
                          </Badge>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        ))}

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <LinkedStat to={`/accreditation/reporting-periods/${currentPeriod.id}?tab=readiness`}>
          <Text size="xs" c="dimmed" tt="uppercase">
            Programs Ready
          </Text>
          <Title order={3}>
            {readiness ? `${readiness.summary.readyPrograms} / ${readiness.summary.totalPrograms}` : "—"}
          </Title>
        </LinkedStat>
        <LinkedStat to="/employers/analytics">
          <Text size="xs" c="dimmed" tt="uppercase">
            Top employer share
          </Text>
          {employerAnalytics ? (
            <>
              <Group gap="xs" align="baseline">
                <Title order={3}>{employerAnalytics.concentration.topEmployerShare}%</Title>
                <Badge color={RISK_COLORS[employerAnalytics.concentration.risk]} size="sm">
                  {employerAnalytics.concentration.risk}
                </Badge>
              </Group>
              <Text size="xs" c="dimmed" lineClamp={1}>
                {employerAnalytics.topEmployers[0]?.employer.name ?? "No placements yet"}
              </Text>
            </>
          ) : (
            <Title order={3}>—</Title>
          )}
        </LinkedStat>
        <LinkedStat to="/followups">
          <Text size="xs" c="dimmed" tt="uppercase">
            Follow-ups overdue
          </Text>
          <Title order={3}>{followUpsOverdue?.pagination.totalItems ?? "—"}</Title>
          <Text size="xs" c="dimmed">
            {followUpQueue ? `${followUpQueue.pagination.totalItems} students in the queue` : "—"}
          </Text>
        </LinkedStat>
        <LinkedStat to="/licensure">
          <Text size="xs" c="dimmed" tt="uppercase">
            Licensure queue
          </Text>
          <Title order={3}>{licensureQueue?.length ?? "—"}</Title>
          <Text size="xs" c="dimmed">
            Graduates without a pass or fail
          </Text>
        </LinkedStat>
      </SimpleGrid>
    </Stack>
  );
}
