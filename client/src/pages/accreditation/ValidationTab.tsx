import { Anchor, Badge, Button, Checkbox, Group, Loader, Stack, Table, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useBulkResolveValidationIssues,
  useReportingPeriod,
  useResolveValidationIssue,
  useValidationIssues,
} from "../../api/accreditation";
import { downloadFile } from "../../lib/apiClient";
import { MergeDuplicatesModal } from "./MergeDuplicatesModal";

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
  const bulkResolve = useBulkResolveValidationIssues(reportingPeriodId);
  const [exporting, setExporting] = useState(false);
  const [mergeOpened, { open: openMerge, close: closeMerge }] = useDisclosure(false);
  const [mergeStudentId, setMergeStudentId] = useState<number | null>(null);
  const [mergeIssueId, setMergeIssueId] = useState<number | null>(null);
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<number>>(new Set());

  function toggleIssue(issueId: number) {
    setSelectedIssueIds((prev) => {
      const next = new Set(prev);
      if (next.has(issueId)) next.delete(issueId);
      else next.add(issueId);
      return next;
    });
  }

  async function handleBulkResolve() {
    try {
      const result = await bulkResolve.mutateAsync([...selectedIssueIds]);
      notifications.show({
        message: `Resolved ${result.resolvedCount} issue${result.resolvedCount === 1 ? "" : "s"}`,
        color: "green",
      });
      setSelectedIssueIds(new Set());
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to resolve selected issues",
        color: "red",
      });
    }
  }

  function handleOpenMerge(studentId: number, issueId: number) {
    setMergeStudentId(studentId);
    setMergeIssueId(issueId);
    openMerge();
  }

  async function handleMerged() {
    if (mergeIssueId) {
      await resolveIssue.mutateAsync(mergeIssueId).catch(() => undefined);
    }
  }

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
  const allSelected = !!issues && issues.length > 0 && issues.every((i) => selectedIssueIds.has(i.id));
  const someSelected = !!issues && issues.some((i) => selectedIssueIds.has(i.id));

  function toggleAll() {
    if (!issues) return;
    setSelectedIssueIds(allSelected ? new Set() : new Set(issues.map((i) => i.id)));
  }

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
        <Group>
          {selectedIssueIds.size > 0 && (
            <Button size="xs" onClick={handleBulkResolve} loading={bulkResolve.isPending}>
              Resolve {selectedIssueIds.size} Selected
            </Button>
          )}
          <Button size="xs" variant="light" onClick={handleExport} loading={exporting}>
            Export to Excel
          </Button>
        </Group>
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
              <Table.Th w={36}>
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected && !allSelected}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </Table.Th>
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
                  <Checkbox
                    checked={selectedIssueIds.has(issue.id)}
                    onChange={() => toggleIssue(issue.id)}
                    aria-label={`Select issue ${issue.id}`}
                  />
                </Table.Td>
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
                  <Group gap={4} wrap="nowrap">
                    {issue.issueType === "POSSIBLE_DUPLICATE_STUDENT" && issue.student && (
                      <Button
                        size="xs"
                        variant="light"
                        color="orange"
                        onClick={() => handleOpenMerge(issue.student!.id, issue.id)}
                      >
                        Merge
                      </Button>
                    )}
                    <Button
                      size="xs"
                      variant="subtle"
                      onClick={() => handleResolve(issue.id)}
                      loading={resolveIssue.isPending}
                    >
                      Resolve
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {mergeStudentId && (
        <MergeDuplicatesModal
          opened={mergeOpened}
          onClose={closeMerge}
          flaggedStudentId={mergeStudentId}
          onMerged={handleMerged}
        />
      )}
    </Stack>
  );
}
