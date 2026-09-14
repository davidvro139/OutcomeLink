import { Accordion, Badge, Loader, Table, Text } from "@mantine/core";
import { useAuditHistory } from "../api/audit";

const ACTION_COLORS: Record<string, string> = {
  CREATE: "green",
  UPDATE: "blue",
  DELETE: "red",
  MERGE: "grape",
  FINALIZE: "orange",
  REOPEN: "yellow",
};

/** Spec §15/§49: every important record should show who changed what, and when. */
export function AuditHistory({ entityType, entityId }: { entityType: string; entityId: number }) {
  const { data: entries, isLoading } = useAuditHistory(entityType, entityId);

  return (
    <Accordion variant="contained">
      <Accordion.Item value="audit-history">
        <Accordion.Control>Audit history</Accordion.Control>
        <Accordion.Panel>
          {isLoading && <Loader size="sm" />}
          {entries && entries.length === 0 && (
            <Text size="sm" c="dimmed">
              No changes recorded yet.
            </Text>
          )}
          {entries && entries.length > 0 && (
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>When</Table.Th>
                  <Table.Th>Who</Table.Th>
                  <Table.Th>Action</Table.Th>
                  <Table.Th>Field</Table.Th>
                  <Table.Th>Change</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {entries.map((entry) => (
                  <Table.Tr key={entry.id}>
                    <Table.Td>{new Date(entry.occurredAt).toLocaleString()}</Table.Td>
                    <Table.Td>{entry.user.name}</Table.Td>
                    <Table.Td>
                      <Badge color={ACTION_COLORS[entry.action] ?? "gray"} size="sm">
                        {entry.action}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{entry.fieldChanged ?? "—"}</Table.Td>
                    <Table.Td>
                      {entry.fieldChanged ? (
                        <Text size="sm">
                          <Text span c="dimmed" td="line-through">
                            {entry.previousValue ?? "(empty)"}
                          </Text>
                          {" → "}
                          {entry.newValue ?? "(empty)"}
                        </Text>
                      ) : (
                        "—"
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
