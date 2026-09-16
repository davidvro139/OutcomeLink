import { LineChart } from "@mantine/charts";
import { Loader, Select, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";
import { useTrends } from "../../api/accreditation";
import { usePrograms } from "../../api/programs";

const SERIES = [
  { name: "COMPLETION", color: "blue.6" },
  { name: "PLACEMENT", color: "teal.6" },
  { name: "LICENSURE", color: "grape.6" },
];

/** Phase 2 P3 (docs/TODO.md): CPL metrics charted across every reporting period, per program or institution-wide. */
export function TrendsPage() {
  const [programId, setProgramId] = useState<number | undefined>(undefined);
  const { data: programs } = usePrograms();
  const { data: trends, isLoading } = useTrends(programId);

  const chartData =
    trends
      ?.filter((t) => Object.keys(t.metrics).length > 0)
      .map((t) => ({
        period: t.reportingPeriod.label,
        COMPLETION: t.metrics.COMPLETION?.percentage ?? null,
        PLACEMENT: t.metrics.PLACEMENT?.percentage ?? null,
        LICENSURE: t.metrics.LICENSURE?.percentage ?? null,
      })) ?? [];

  return (
    <Stack p="xl" gap="md">
      <Title order={2}>Historical Trends</Title>
      <Text c="dimmed" size="sm">
        Completion, Placement, and Licensure rates across every computed reporting period.
      </Text>

      <Select
        label="Program"
        placeholder="Institution-wide"
        clearable
        data={programs?.items.map((p) => ({ value: String(p.id), label: p.name })) ?? []}
        value={programId ? String(programId) : null}
        onChange={(v) => setProgramId(v ? Number(v) : undefined)}
        w={320}
      />

      {isLoading && <Loader />}

      {!isLoading && chartData.length === 0 && (
        <Text c="dimmed" ta="center" py="xl">
          No computed reporting periods yet for {programId ? "this program" : "this institution"}.
        </Text>
      )}

      {chartData.length > 0 && (
        <LineChart
          h={400}
          data={chartData}
          dataKey="period"
          series={SERIES}
          curveType="monotone"
          withLegend
          yAxisProps={{ domain: [0, 100] }}
          unit="%"
        />
      )}
    </Stack>
  );
}
