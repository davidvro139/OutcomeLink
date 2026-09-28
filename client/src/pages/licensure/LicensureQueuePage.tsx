import { Anchor, Badge, Loader, Stack, Table, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";
import { useLicensureQueue } from "../../api/licensure";

const RESULT_COLORS: Record<string, string> = {
  WAITING: "yellow",
  SCHEDULED: "blue",
  UNKNOWN: "gray",
};

/** Phase 2 P1 (docs/TODO.md): every graduate completer of a licensure-required program without a resolved exam result yet. */
export function LicensureQueuePage() {
  const { data, isLoading } = useLicensureQueue();

  return (
    <Stack p="xl" gap="md">
      <Title order={2}>Licensure Queue</Title>
      <Text c="dimmed" size="sm">
        Graduate completers of licensure-required programs still awaiting a passed/failed exam
        result.
      </Text>

      {isLoading && <Loader />}

      {data && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Student</Table.Th>
              <Table.Th>Program</Table.Th>
              <Table.Th>Completed</Table.Th>
              <Table.Th>Exam</Table.Th>
              <Table.Th>Attempt</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.map((row) => (
              <Table.Tr key={`${row.student.id}-${row.program.id}`}>
                <Table.Td>
                  <Anchor component={Link} to={`/students/${row.student.id}`}>
                    {row.student.firstName} {row.student.lastName}
                  </Anchor>
                </Table.Td>
                <Table.Td>{row.program.name}</Table.Td>
                <Table.Td>
                  {row.completionDate ? new Date(row.completionDate).toLocaleDateString() : "—"}
                </Table.Td>
                <Table.Td>{row.latestResult?.examName ?? "—"}</Table.Td>
                <Table.Td>{row.latestResult?.attemptNumber ?? "—"}</Table.Td>
                <Table.Td>
                  {row.latestResult ? (
                    <Badge color={RESULT_COLORS[row.latestResult.result] ?? "gray"}>
                      {row.latestResult.result}
                    </Badge>
                  ) : (
                    <Badge color="red">No result on file</Badge>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {data && data.length === 0 && (
        <Text c="dimmed" ta="center" py="xl">
          No one is awaiting a licensure result right now.
        </Text>
      )}
    </Stack>
  );
}
