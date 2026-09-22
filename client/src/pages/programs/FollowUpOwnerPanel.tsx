import { Button, Group, Paper, Select, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import {
  useProgramFollowUpOwner,
  useRemoveProgramFollowUpOwner,
  useSetProgramFollowUpOwner,
} from "../../api/programs";
import { useUsers } from "../../api/users";
import { useAuth } from "../../auth/AuthContext";

const CAN_MANAGE = ["SYSTEM_ADMINISTRATOR", "INSTITUTIONAL_ADMINISTRATOR"];

/**
 * Advanced Workflow Automation (Phase 3, docs/TODO.md): the one staff member
 * auto-assignment hands new follow-up work to for this program. Optional —
 * a program with no owner set just means auto-assignment skips it.
 */
export function FollowUpOwnerPanel({ programId }: { programId: number }) {
  const { user } = useAuth();
  const canManage = !!user && CAN_MANAGE.includes(user.role);
  const { data: owner, isLoading } = useProgramFollowUpOwner(programId);
  const { data: staff } = useUsers();
  const setOwner = useSetProgramFollowUpOwner(programId);
  const removeOwner = useRemoveProgramFollowUpOwner(programId);
  const [selected, setSelected] = useState<string | null>(null);

  if (!canManage) return null;

  async function handleSave() {
    if (!selected) return;
    try {
      await setOwner.mutateAsync(Number(selected));
      notifications.show({ message: "Follow-up owner set", color: "green" });
      setSelected(null);
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to set follow-up owner",
        color: "red",
      });
    }
  }

  async function handleRemove() {
    try {
      await removeOwner.mutateAsync();
      notifications.show({ message: "Follow-up owner cleared", color: "green" });
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to clear follow-up owner",
        color: "red",
      });
    }
  }

  const staffOptions = (staff ?? [])
    .filter((u) => u.role !== "READ_ONLY_AUDITOR")
    .map((u) => ({ value: String(u.id), label: u.name }));

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Text fw={500}>Follow-Up Owner</Text>
        <Text size="sm" c="dimmed">
          When a graduate needing follow-up has no assignment yet, automation hands it to this
          person — leave unset to skip auto-assignment for this program.
        </Text>
        {isLoading ? null : owner ? (
          <Group justify="space-between">
            <Text>{owner.staffUser.name}</Text>
            <Button size="xs" variant="subtle" color="red" onClick={handleRemove} loading={removeOwner.isPending}>
              Clear
            </Button>
          </Group>
        ) : (
          <Group>
            <Select
              placeholder="Choose a staff member…"
              data={staffOptions}
              value={selected}
              onChange={setSelected}
              searchable
              w={260}
            />
            <Button size="xs" onClick={handleSave} loading={setOwner.isPending} disabled={!selected}>
              Set Owner
            </Button>
          </Group>
        )}
      </Stack>
    </Paper>
  );
}
