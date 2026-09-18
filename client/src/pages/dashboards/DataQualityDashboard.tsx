import { BarChart } from "@mantine/charts";
import { Badge, Button, Group, Loader, Paper, Select, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useReportingPeriods, useValidationIssues } from "../../api/accreditation";
import { useGenerateMissingOutcomesDigest } from "../../api/notifications";

const SEVERITY_COLORS: Record<string, string> = { ERROR: "red", WARNING: "yellow", INFORMATION: "blue" };

// Matches DashboardPage.tsx's DATA_QUALITY_ROLES exactly — that gate on the
// tab itself is a deliberate, already-verified P6 decision (this dashboard is
// admin-only); the backend's own role check on the digest endpoint is
// broader (every operational role), but nothing outside this admin-only tab
// currently offers a UI path to it.
const CAN_SEND_DIGEST = ["SYSTEM_ADMINISTRATOR", "INSTITUTIONAL_ADMINISTRATOR"];

/**
 * Phase 2 P6 (docs/TODO.md): an aggregate view over the same
 * ValidationIssue rows the per-period Validation tab already lists one by
 * one — how much unresolved data-quality debt exists, broken down by
 * severity and by issue type, so staff can prioritize by volume rather than
 * scrolling a flat list.
 */
export function DataQualityDashboard() {
  const { user } = useAuth();
  const { data: periods } = useReportingPeriods();
  const [periodId, setPeriodId] = useState<number | undefined>(undefined);
  const effectivePeriodId = periodId ?? periods?.[0]?.id;
  const { data: issues, isLoading } = useValidationIssues(effectivePeriodId);
  const generateDigest = useGenerateMissingOutcomesDigest();

  async function handleSendDigest() {
    if (!effectivePeriodId) return;
    try {
      const result = await generateDigest.mutateAsync(effectivePeriodId);
      notifications.show({
        message:
          result.recipientCount === 0
            ? "No students with an unresolved outcome this period — no digest needed."
            : `Missing-outcomes digest sent to ${result.recipientCount} staff member${result.recipientCount === 1 ? "" : "s"}.`,
        color: "green",
      });
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to send digest",
        color: "red",
      });
    }
  }

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
      <Group justify="space-between" align="flex-end">
        <Select
          label="Reporting period"
          data={periods?.map((p) => ({ value: String(p.id), label: p.label })) ?? []}
          value={effectivePeriodId ? String(effectivePeriodId) : null}
          onChange={(v) => setPeriodId(v ? Number(v) : undefined)}
          allowDeselect={false}
          w={280}
        />
        {user && CAN_SEND_DIGEST.includes(user.role) && (
          <Button
            size="xs"
            variant="light"
            onClick={handleSendDigest}
            loading={generateDigest.isPending}
            disabled={!effectivePeriodId}
          >
            Send Missing-Outcomes Digest
          </Button>
        )}
      </Group>

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
