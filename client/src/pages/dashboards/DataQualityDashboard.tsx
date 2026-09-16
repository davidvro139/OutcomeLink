import { BarChart } from "@mantine/charts";
import { Badge, Loader, Paper, Select, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { useMemo, useState } from "react";
import { useReportingPeriods, useValidationIssues } from "../../api/accreditation";

const SEVERITY_COLORS: Record<string, string> = { ERROR: "red", WARNING: "yellow", INFORMATION: "blue" };

/**
 * Phase 2 P6 (docs/TODO.md): an aggregate view over the same
 * ValidationIssue rows the per-period Validation tab already lists one by
 * one — how much unresolved data-quality debt exists, broken down by
 * severity and by issue type, so staff can prioritize by volume rather than
 * scrolling a flat list.
 */
export function DataQualityDashboard() {
  const { data: periods } = useReportingPeriods();
  const [periodId, setPeriodId] = useState<number | undefined>(undefined);
  const effectivePeriodId = periodId ?? periods?.[0]?.id;
  const { data: issues, isLoading } = useValidationIssues(effectivePeriodId);

  const open = useMemo(() => issues?.filter((i) => !i.resolvedAt) ?? [], [issues]);

  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = { ERROR: 0, WARNING: 0, INFORMATION: 0 };
    for (const issue of open) counts[issue.severity] = (counts[issue.severity] ?? 0) + 1;
    return counts;
  }, [open]);

  const byIssueType = useMemo(() => {
    const counts = new Map<string, { issueType: string; severity: string; count: number }>();
    for (const issue of open) {
      const existing = counts.get(issue.issueType);
      if (existing) existing.count += 1;
      else counts.set(issue.issueType, { issueType: issue.issueType, severity: issue.severity, count: 1 });
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  }, [open]);

  return (
    <Stack gap="md">
      <Select
        label="Reporting period"
        data={periods?.map((p) => ({ value: String(p.id), label: p.label })) ?? []}
        value={effectivePeriodId ? String(effectivePeriodId) : null}
        onChange={(v) => setPeriodId(v ? Number(v) : undefined)}
        allowDeselect={false}
        w={280}
      />

      {isLoading && <Loader />}

      {issues && (
        <>
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <Paper withBorder p="md" radius="md">
              <Text size="xs" c="dimmed" tt="uppercase">
                Errors
              </Text>
              <Title order={2} c="red">
                {severityCounts.ERROR}
              </Title>
            </Paper>
            <Paper withBorder p="md" radius="md">
              <Text size="xs" c="dimmed" tt="uppercase">
                Warnings
              </Text>
              <Title order={2} c="yellow.7">
                {severityCounts.WARNING}
              </Title>
            </Paper>
            <Paper withBorder p="md" radius="md">
              <Text size="xs" c="dimmed" tt="uppercase">
                Information
              </Text>
              <Title order={2} c="blue">
                {severityCounts.INFORMATION}
              </Title>
            </Paper>
          </SimpleGrid>

          {open.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              No open data-quality issues for this period.
            </Text>
          ) : (
            <>
              <BarChart
                h={220}
                data={[
                  { severity: "Errors", count: severityCounts.ERROR },
                  { severity: "Warnings", count: severityCounts.WARNING },
                  { severity: "Information", count: severityCounts.INFORMATION },
                ]}
                dataKey="severity"
                series={[{ name: "count", color: "red.6" }]}
              />

              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Issue Type</Table.Th>
                    <Table.Th>Severity</Table.Th>
                    <Table.Th>Count</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {byIssueType.map((row) => (
                    <Table.Tr key={row.issueType}>
                      <Table.Td>{row.issueType}</Table.Td>
                      <Table.Td>
                        <Badge color={SEVERITY_COLORS[row.severity]} size="sm">
                          {row.severity}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{row.count}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </>
          )}
        </>
      )}
    </Stack>
  );
}
