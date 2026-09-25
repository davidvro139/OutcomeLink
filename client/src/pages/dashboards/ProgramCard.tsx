import {
  CPL_METRICS,
  RISK_STATUS_LABELS,
  type CplMetric,
  type RiskStatus,
} from "@outcomelink/shared";
import { LineChart } from "@mantine/charts";
import { Badge, Box, Button, Collapse, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import type { MetricAssessment, ProgramAssessment } from "../../api/programDashboard";
import { describeMetric, METRIC_LABELS, plural, STATUS_COLORS } from "./riskDisplay";

/** A rate bar with a tick at the benchmark, so the gap is visible at a glance. */
function RateBar({
  percentage,
  benchmark,
  status,
}: {
  percentage: number;
  benchmark: number;
  status: RiskStatus;
}) {
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  return (
    <Box
      pos="relative"
      h={12}
      style={{ background: "var(--mantine-color-gray-2)", borderRadius: 6 }}
      aria-hidden
    >
      <Box
        h="100%"
        w={`${clamp(percentage)}%`}
        style={{ background: `var(--mantine-color-${STATUS_COLORS[status]}-6)`, borderRadius: 6 }}
      />
      <Box
        pos="absolute"
        top={-3}
        h={18}
        w={2}
        style={{ left: `${clamp(benchmark)}%`, background: "var(--mantine-color-dark-6)" }}
        title={`Benchmark ${benchmark}%`}
      />
    </Box>
  );
}

function MetricRow({ metric, m }: { metric: CplMetric; m: MetricAssessment }) {
  return (
    <Stack gap={4} aria-label={`${METRIC_LABELS[metric]} status`}>
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm" fw={500}>
          {METRIC_LABELS[metric]}
        </Text>
        <Group gap="xs" wrap="nowrap">
          {m.status !== "NO_DATA" && (
            <Text size="sm">
              <b>{m.percentage}%</b>{" "}
              <Text span c="dimmed">
                of {m.benchmark}%
              </Text>
            </Text>
          )}
          <Badge color={STATUS_COLORS[m.status]} variant="light" size="sm">
            {RISK_STATUS_LABELS[m.status]}
          </Badge>
        </Group>
      </Group>
      {m.status !== "NO_DATA" && (
        <RateBar percentage={m.percentage} benchmark={m.benchmark} status={m.status} />
      )}
      <Text size="xs" c="dimmed">
        {describeMetric(metric, m)}
      </Text>
    </Stack>
  );
}

function TrendChart({ metric, program }: { metric: CplMetric; program: ProgramAssessment }) {
  const points = program.trend[metric];
  const plotted = points.filter((p) => p.percentage !== null);
  return (
    <Stack gap={2}>
      <Text size="xs" fw={500}>
        {METRIC_LABELS[metric]} across periods
      </Text>
      {plotted.length < 2 ? (
        <Text size="xs" c="dimmed">
          A trend needs at least two computed periods.
        </Text>
      ) : (
        <LineChart
          h={120}
          data={points.map((p) => ({
            period: p.label,
            rate: p.percentage,
            benchmark: p.benchmark,
          }))}
          dataKey="period"
          series={[
            { name: "rate", label: "Rate", color: "blue.6" },
            { name: "benchmark", label: "Benchmark", color: "gray.6", strokeDasharray: "5 4" },
          ]}
          yAxisProps={{ domain: [0, 100] }}
          unit="%"
          connectNulls
          curveType="linear"
          withLegend={false}
          withDots
          gridAxis="xy"
        />
      )}
    </Stack>
  );
}

/** One program: overall status, each metric against its benchmark in plain words, and (expandable) the trend. */
export function ProgramCard({ program }: { program: ProgramAssessment }) {
  const [trendOpen, { toggle }] = useDisclosure(false);
  const shown = CPL_METRICS.filter((metric) => program.metrics[metric]);

  return (
    <Paper withBorder p="md" radius="md" aria-label={`${program.name} status`}>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <Title order={4}>{program.name}</Title>
            <Text size="xs" c="dimmed">
              {[program.code, program.campusName].filter(Boolean).join(" · ")}
            </Text>
          </div>
          <Badge color={STATUS_COLORS[program.status]} size="lg">
            {RISK_STATUS_LABELS[program.status]}
          </Badge>
        </Group>

        {shown.length === 0 ? (
          <Text size="sm" c="dimmed">
            No computed results for this program yet.
          </Text>
        ) : (
          shown.map((metric) => (
            <MetricRow key={metric} metric={metric} m={program.metrics[metric]!} />
          ))
        )}

        {(program.unresolvedOutcomeCount > 0 || program.openIssueCount > 0) && (
          <Group gap="xs">
            {program.unresolvedOutcomeCount > 0 && (
              <Badge variant="outline" color="orange" size="sm">
                {plural(program.unresolvedOutcomeCount, "graduate")} without an outcome
              </Badge>
            )}
            {program.openIssueCount > 0 && (
              <Badge variant="outline" color="red" size="sm">
                {plural(program.openIssueCount, "open validation issue")}
              </Badge>
            )}
          </Group>
        )}

        {shown.length > 0 && (
          <>
            <Button
              variant="subtle"
              size="compact-xs"
              onClick={toggle}
              style={{ alignSelf: "flex-start" }}
            >
              {trendOpen ? "Hide trend" : "Show trend against benchmark"}
            </Button>
            <Collapse in={trendOpen}>
              <Stack gap="sm">
                {shown.map((metric) => (
                  <TrendChart key={metric} metric={metric} program={program} />
                ))}
              </Stack>
            </Collapse>
          </>
        )}
      </Stack>
    </Paper>
  );
}
