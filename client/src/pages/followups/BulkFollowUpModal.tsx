import { FOLLOW_UP_METHODS, FOLLOW_UP_OUTCOMES } from "@outcomelink/shared";
import { Alert, Button, List, Modal, Select, Stack, Text, Textarea } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useBulkCreateFollowUpAttempts } from "../../api/followups";

interface BulkFollowUpFormValues {
  attemptedAt: string;
  method: (typeof FOLLOW_UP_METHODS)[number];
  outcome: (typeof FOLLOW_UP_OUTCOMES)[number];
  notes: string;
}

/**
 * Phase 2 P11 (docs/TODO.md): log one follow-up attempt against every
 * selected Follow-Up Queue row at once (e.g. "called this whole list today,
 * no answer") instead of opening each student's page individually.
 */
export function BulkFollowUpModal({
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
  const bulkCreate = useBulkCreateFollowUpAttempts();

  const form = useForm<BulkFollowUpFormValues>({
    initialValues: {
      attemptedAt: new Date().toISOString().slice(0, 16),
      method: "PHONE",
      outcome: "NO_RESPONSE",
      notes: "",
    },
  });

  async function handleSubmit(values: BulkFollowUpFormValues) {
    try {
      const result = await bulkCreate.mutateAsync({
        studentIds,
        attemptedAt: new Date(values.attemptedAt).toISOString(),
        method: values.method,
        outcome: values.outcome,
        notes: values.notes.trim() || undefined,
      });
      notifications.show({
        message:
          result.skipped.length > 0
            ? `Logged for ${result.createdCount} student${result.createdCount === 1 ? "" : "s"}; ${result.skipped.length} skipped (see notification list).`
            : `Follow-up logged for ${result.createdCount} student${result.createdCount === 1 ? "" : "s"}.`,
        color: result.skipped.length > 0 ? "yellow" : "green",
        autoClose: result.skipped.length > 0 ? false : undefined,
      });
      form.reset();
      onClose();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to log bulk follow-up",
        color: "red",
      });
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={`Log Follow-Up for ${studentIds.length} Students`}>
      <form onSubmit={form.onSubmit(handleSubmit)}>
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

          <input type="datetime-local" {...form.getInputProps("attemptedAt")} style={{ padding: 8 }} />
          <Select
            label="Method"
            data={FOLLOW_UP_METHODS.map((m) => ({ value: m, label: m }))}
            {...form.getInputProps("method")}
            allowDeselect={false}
          />
          <Select
            label="Outcome"
            data={FOLLOW_UP_OUTCOMES.map((o) => ({ value: o, label: o }))}
            {...form.getInputProps("outcome")}
            allowDeselect={false}
          />
          <Textarea label="Notes" {...form.getInputProps("notes")} />
          <Text size="xs" c="dimmed">
            Students flagged do-not-contact are skipped automatically, even if selected.
          </Text>
          <Button type="submit" loading={bulkCreate.isPending}>
            Log Follow-Up for {studentIds.length} Students
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
