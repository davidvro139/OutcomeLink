import { Anchor, Badge, Button, Group, Loader, Stack, Table, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useReportingPeriod,
  useResolveValidationIssue,
  useValidationIssues,
} from "../../api/accreditation";
import { downloadFile } from "../../lib/apiClient";

const SEVERITY_COLORS: Record<string, string> = {
  ERROR: "red",
  WARNING: "yellow",
  INFORMATION: "blue",
};

/** Spec §21-22: ERROR/WARNING/INFORMATION list, clickable through to the record. */
export function ValidationTab({ reportingPeriodId }: { reportingPeriodId: number }) {
  const { data: issues, isLoading } = useValidationIssues(reportingPeriodId);
  const { data: period } = useReportingPeriod(reportingPeriodId);
  const resolveIssue = useResolveValidationIssue(reportingPeriodId);
  const [exporting, setExporting] = useState(false);

  async function handleResolve(issueId: number) {
    try {
      await resolveIssue.mutateAsync(issueId);
      notifications.show({ message: "Issue resolved", color: "green" });
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to resolve issue",
        color: "red",
      });
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      await downloadFile(
        `/api/accreditation/reporting-periods/${reportingPeriodId}/validation-issues/export`,
        `validation-issues-${period?.label ?? reportingPeriodId}.xlsx`,
      );
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to export validation issues",
        color: "red",
      });
    } finally {
      setExporting(false);
    }
  }

  if (isLoading) return <Loader />;

  const errorCount = issues?.filter((i) => i.severity === "ERROR").length ?? 0;
  const warningCount = issues?.filter((i) => i.severity === "WARNING").length ?? 0;

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Group>
          <Badge color="red" size="lg">
            {errorCount} errors
          </Badge>
          <Badge color="yellow" size="lg">
            {warningCount} warnings
          </Badge>
        </Group>
        <Button size="xs" variant="light" onClick={handleExport} loading={exporting}>
          Export to Excel
        </Button>
      </Group>

      {issues && issues.length === 0 && (
        <Text c="dimmed" py="xl">
          No open validation issues. Click "Run Validation" above to check again.
        </Text>
      )}

      {issues && issues.length > 0 && (
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Severity</Table.Th>
              <Table.Th>Issue</Table.Th>
              <Table.Th>Student</Table.Th>
              <Table.Th>Program</Table.Th>
              <Table.Th></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {issues.map((issue) => (
              <Table.Tr key={issue.id}>
                <Table.Td>
                  <Badge color={SEVERITY_COLORS[issue.severity]}>{issue.severity}</Badge>
                </Table.Td>
                <Table.Td>{issue.issueType.replaceAll("_", " ")}</Table.Td>
                <Table.Td>
                  {issue.student ? (
                    <Anchor component={Link} to={`/students/${issue.student.id}`}>
                      {issue.student.firstName} {issue.student.lastName}
                    </Anchor>
                  ) : (
                    "—"
                  )}
                </Table.Td>
                <Table.Td>{issue.program?.name ?? "—"}</Table.Td>
                <Table.Td>
                  <Button
                    size="xs"
                    variant="subtle"
                    onClick={() => handleResolve(issue.id)}
                    loading={resolveIssue.isPending}
                  >
                    Resolve
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
