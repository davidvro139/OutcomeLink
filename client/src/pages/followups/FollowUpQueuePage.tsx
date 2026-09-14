import { Badge, Group, Loader, NumberInput, Stack, Table, Text, Title } from "@mantine/core";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useFollowUpQueue } from "../../api/followups";

/** Spec §12: task-oriented follow-up queue with overdue highlighting. */
export function FollowUpQueuePage() {
  const [minDaysOverdue, setMinDaysOverdue] = useState<number | undefined>(undefined);
  const { data, isLoading } = useFollowUpQueue({ minDaysOverdue });

  return (
    <Stack p="xl" gap="md">
      <Title order={2}>Follow-Up Queue</Title>

      <Group>
        <NumberInput
          label="Minimum days overdue"
          placeholder="e.g. 7"
          value={minDaysOverdue}
          onChange={(value) => setMinDaysOverdue(typeof value === "number" ? value : undefined)}
          w={220}
          min={0}
        />
      </Group>

      {isLoading && <Loader />}

      {data && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
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
            {data.items.map((row) => (
              <Table.Tr key={row.student.id} bg={row.daysOverdue > 0 ? "red.0" : undefined}>
                <Table.Td>
                  <Link to={`/students/${row.student.id}`}>
                    {row.student.firstName} {row.student.lastName}
                  </Link>
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
                <Table.Td>{row.assignedTo?.name ?? "Unassigned"}</Table.Td>
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
    </Stack>
  );
}
