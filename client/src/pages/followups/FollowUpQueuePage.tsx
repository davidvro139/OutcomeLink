import { Anchor, Badge, Button, Checkbox, Group, Loader, NumberInput, Select, Stack, Table, Text, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAssignFollowUp, useFollowUpQueue } from "../../api/followups";
import { useUsers } from "../../api/users";
import { BulkAssignModal } from "./BulkAssignModal";
import { BulkFollowUpModal } from "./BulkFollowUpModal";

function AssignedToCell({ studentId, assignedTo }: { studentId: number; assignedTo: { id: number; name: string } | null }) {
  const { data: staff } = useUsers();
  const assign = useAssignFollowUp();

  async function handleChange(value: string | null) {
    try {
      await assign.mutateAsync({ studentId, staffUserId: value ? Number(value) : null });
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to assign",
        color: "red",
      });
    }
  }

  const staffOptions = (staff ?? [])
    .filter((u) => u.role !== "READ_ONLY_AUDITOR")
    .map((u) => ({ value: String(u.id), label: u.name }));

  return (
    <Select
      placeholder="Unassigned"
      data={staffOptions}
      value={assignedTo ? String(assignedTo.id) : null}
      onChange={handleChange}
      clearable
      searchable
      size="xs"
      w={180}
      disabled={assign.isPending}
    />
  );
}

/** Spec §12: task-oriented follow-up queue with overdue highlighting. */
export function FollowUpQueuePage() {
  const [minDaysOverdue, setMinDaysOverdue] = useState<number | undefined>(undefined);
  const { data, isLoading } = useFollowUpQueue({ minDaysOverdue });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkOpened, { open: openBulk, close: closeBulk }] = useDisclosure(false);
  const [bulkAssignOpened, { open: openBulkAssign, close: closeBulkAssign }] = useDisclosure(false);

  const rows = data?.items ?? [];
  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.student.id));
  const someSelected = rows.some((row) => selectedIds.has(row.student.id));

  const studentLabels = new Map(
    rows.map((row) => [row.student.id, `${row.student.firstName} ${row.student.lastName}`]),
  );

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(rows.map((row) => row.student.id)));
  }

  function toggleOne(studentId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function handleBulkClose() {
    closeBulk();
    setSelectedIds(new Set());
  }

  function handleBulkAssignClose() {
    closeBulkAssign();
    setSelectedIds(new Set());
  }

  return (
    <Stack p="xl" gap="md">
      <Title order={2}>Follow-Up Queue</Title>

      <Group justify="space-between">
        <NumberInput
          label="Minimum days overdue"
          placeholder="e.g. 7"
          value={minDaysOverdue}
          onChange={(value) => setMinDaysOverdue(typeof value === "number" ? value : undefined)}
          w={220}
          min={0}
        />
        {selectedIds.size > 0 && (
          <Group gap="xs">
            <Button variant="light" onClick={openBulkAssign}>
              Assign {selectedIds.size} Selected
            </Button>
            <Button onClick={openBulk}>Log Follow-Up for {selectedIds.size} Selected</Button>
          </Group>
        )}
      </Group>

      {isLoading && <Loader />}

      {data && (
        <Table striped highlightOnHover>
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
              <Table.Th>Student</Table.Th>
              <Table.Th>Program</Table.Th>
              <Table.Th>Campus</Table.Th>
              <Table.Th>Attempts</Table.Th>
              <Table.Th>Last Contact</Table.Th>
              <Table.Th>Last Outcome</Table.Th>
              <Table.Th>Next Follow-Up</Table.Th>
              <Table.Th>Assigned To</Table.Th>
              <Table.Th>Days Overdue</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row) => (
              <Table.Tr
                key={row.student.id}
                bg={row.daysOverdue > 0 ? "var(--mantine-color-red-light)" : undefined}
              >
                <Table.Td>
                  <Checkbox
                    checked={selectedIds.has(row.student.id)}
                    onChange={() => toggleOne(row.student.id)}
                    aria-label={`Select ${row.student.firstName} ${row.student.lastName}`}
                  />
                </Table.Td>
                <Table.Td>
                  <Anchor component={Link} to={`/students/${row.student.id}`}>
                    {row.student.firstName} {row.student.lastName}
                  </Anchor>
                </Table.Td>
                <Table.Td>{row.program?.name ?? "—"}</Table.Td>
                <Table.Td>{row.campus?.name ?? "—"}</Table.Td>
                <Table.Td>{row.attempts}</Table.Td>
                <Table.Td>
                  {row.lastContact ? new Date(row.lastContact).toLocaleDateString() : "Never"}
                </Table.Td>
                <Table.Td>{row.lastOutcome ?? "—"}</Table.Td>
                <Table.Td>
                  {row.nextFollowUpDate ? new Date(row.nextFollowUpDate).toLocaleDateString() : "—"}
                </Table.Td>
                <Table.Td>
                  <AssignedToCell studentId={row.student.id} assignedTo={row.assignedTo} />
                </Table.Td>
                <Table.Td>
                  {row.daysOverdue > 0 ? (
                    <Badge color="red">{row.daysOverdue} days</Badge>
                  ) : (
                    <Text size="sm">On track</Text>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {data && data.items.length === 0 && (
        <Text c="dimmed" ta="center" py="xl">
          No students match this filter.
        </Text>
      )}

      <BulkFollowUpModal
        opened={bulkOpened}
        onClose={handleBulkClose}
        studentIds={[...selectedIds]}
        studentLabels={studentLabels}
      />
      <BulkAssignModal
        opened={bulkAssignOpened}
        onClose={handleBulkAssignClose}
        studentIds={[...selectedIds]}
        studentLabels={studentLabels}
      />
    </Stack>
  );
}
