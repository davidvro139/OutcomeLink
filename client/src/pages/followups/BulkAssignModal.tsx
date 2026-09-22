import { Alert, Button, List, Modal, Select, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { useBulkAssignFollowUp } from "../../api/followups";
import { useUsers } from "../../api/users";

/** Advanced Workflow Automation (Phase 3, docs/TODO.md): assign many Follow-Up Queue rows to one staff member at once, same shape as BulkFollowUpModal. */
export function BulkAssignModal({
  opened,
  onClose,
  studentIds,
  studentLabels,
}: {
  opened: boolean;
  onClose: () => void;
  studentIds: number[];
  studentLabels: Map<number, string>;
}) {
  const { data: staff } = useUsers();
  const bulkAssign = useBulkAssignFollowUp();
  const [staffUserId, setStaffUserId] = useState<string | null>(null);

  async function handleSubmit() {
    if (!staffUserId) return;
    try {
      const result = await bulkAssign.mutateAsync({ studentIds, staffUserId: Number(staffUserId) });
      notifications.show({
        message:
          result.skipped.length > 0
            ? `Assigned ${result.assignedCount} student${result.assignedCount === 1 ? "" : "s"}; ${result.skipped.length} skipped.`
            : `Assigned ${result.assignedCount} student${result.assignedCount === 1 ? "" : "s"}.`,
        color: result.skipped.length > 0 ? "yellow" : "green",
      });
      setStaffUserId(null);
      onClose();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to bulk assign",
        color: "red",
      });
    }
  }

  const staffOptions = (staff ?? [])
    .filter((u) => u.role !== "READ_ONLY_AUDITOR")
    .map((u) => ({ value: String(u.id), label: u.name }));

  return (
    <Modal opened={opened} onClose={onClose} title={`Assign ${studentIds.length} Students`}>
      <Stack gap="md">
        <Alert color="blue" variant="light">
          <Text size="sm" fw={500} mb={4}>
            Selected students
          </Text>
          <List size="sm" spacing={2}>
            {studentIds.slice(0, 8).map((id) => (
              <List.Item key={id}>{studentLabels.get(id) ?? `Student #${id}`}</List.Item>
            ))}
            {studentIds.length > 8 && <List.Item>and {studentIds.length - 8} more…</List.Item>}
          </List>
        </Alert>

        <Select
          label="Assign to"
          placeholder="Choose a staff member…"
          data={staffOptions}
          value={staffUserId}
          onChange={setStaffUserId}
          searchable
        />
        <Button onClick={handleSubmit} loading={bulkAssign.isPending} disabled={!staffUserId}>
          Assign {studentIds.length} Students
        </Button>
      </Stack>
    </Modal>
  );
}
