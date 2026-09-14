import { Badge, Loader, Paper, Table, Text, Title } from "@mantine/core";
import { useStudentExplanation } from "../../api/accreditation";

/** "How This Student Counts" — spec §19. Shows why a student does or doesn't count in each CPL metric. */
export function StudentExplanationPanel({
  reportingPeriodId,
  enrollmentId,
}: {
  reportingPeriodId: number;
  enrollmentId: number;
}) {
  const { data: classifications, isLoading } = useStudentExplanation(
    reportingPeriodId,
    enrollmentId,
  );

  return (
    <Paper withBorder p="md" radius="md" bg="blue.0">
      <Title order={5} mb="xs">
        How This Student Counts
      </Title>
      {isLoading && <Loader size="sm" />}
      {classifications && classifications.length === 0 && (
        <Text size="sm" c="dimmed">
          Not yet computed for this reporting period — run the CPL calculation first.
        </Text>
      )}
      {classifications && classifications.length > 0 && (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Metric</Table.Th>
              <Table.Th>Classification</Table.Th>
              <Table.Th>Numerator</Table.Th>
              <Table.Th>Denominator</Table.Th>
              <Table.Th>Why</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {classifications.map((c) => (
              <Table.Tr key={c.metric}>
                <Table.Td>{c.metric}</Table.Td>
                <Table.Td>
                  <Badge variant="light">{c.classificationCode}</Badge>
                </Table.Td>
                <Table.Td>{c.countsInNumerator ? "✓" : "—"}</Table.Td>
                <Table.Td>{c.countsInDenominator ? "✓" : "—"}</Table.Td>
                <Table.Td>
                  <Text size="sm">{c.reasonText}</Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Paper>
  );
}
