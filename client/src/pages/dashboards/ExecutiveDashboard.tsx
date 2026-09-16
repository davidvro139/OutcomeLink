import { CPL_METRICS } from "@outcomelink/shared";
import {
  Badge,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconArrowDown, IconArrowUp, IconMinus } from "@tabler/icons-react";
import { useMemo } from "react";
import { useReadiness, useReportingPeriods, useTrends } from "../../api/accreditation";
import { useEmployerAnalytics } from "../../api/employers";
import { useFollowUpQueue } from "../../api/followups";
import { useLicensureQueue } from "../../api/licensure";

const RISK_COLORS: Record<string, string> = { LOW: "green", MODERATE: "yellow", HIGH: "red" };

/**
 * Phase 2 P6 (docs/TODO.md): the institution's own top-level "how are we
 * doing" view — current-period rates, whether they're trending up or down,
 * how exposed the institution is to a small number of employers, and how
 * much operational work is outstanding. Deliberately a composition of
 * endpoints that already exist elsewhere (Readiness, Trends, Employer
 * Analytics, the two queues) rather than new aggregation logic, so this can
 * never show a different number than the page that number actually lives on.
 */
export function ExecutiveDashboard() {
  const { data: periods, isLoading: periodsLoading } = useReportingPeriods();
  const currentPeriod = periods?.[0];
  const { data: readiness, isLoading: readinessLoading } = useReadiness(currentPeriod?.id);
  const { data: trends } = useTrends(undefined);
  const { data: employerAnalytics } = useEmployerAnalytics(undefined);
  const { data: followUpQueue } = useFollowUpQueue({});
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
      <Text size="sm" c="dimmed">
        Current period: <strong>{currentPeriod.label}</strong> ({currentPeriod.status})
      </Text>

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

      <SimpleGrid cols={{ base: 1, sm: 4 }}>
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed" tt="uppercase">
            Programs Ready
          </Text>
          <Title order={3}>
            {readiness ? `${readiness.summary.readyPrograms} / ${readiness.summary.totalPrograms}` : "—"}
          </Title>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed" tt="uppercase">
            Employer Concentration
          </Text>
          {employerAnalytics ? (
            <Badge color={RISK_COLORS[employerAnalytics.concentration.risk]} size="lg" mt={4}>
              {employerAnalytics.concentration.risk}
            </Badge>
          ) : (
            <Title order={3}>—</Title>
          )}
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed" tt="uppercase">
            Follow-Up Queue
          </Text>
          <Title order={3}>{followUpQueue?.pagination.totalItems ?? "—"}</Title>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed" tt="uppercase">
            Licensure Queue
          </Text>
          <Title order={3}>{licensureQueue?.length ?? "—"}</Title>
        </Paper>
      </SimpleGrid>
    </Stack>
  );
}
