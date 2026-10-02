import { FOLLOW_UP_METHODS, FOLLOW_UP_OUTCOMES } from "@outcomelink/shared";
import { Alert, Button, Group, List, Modal, Select, Stack, Text, Textarea } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { notifications } from "@mantine/notifications";
import { useBulkCreateFollowUpAttempts } from "../../api/followups";
import { toDatetimeLocalValue } from "../../lib/forms";

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
  const [reviewMode, setReviewMode] = useState(false);

  const form = useForm<BulkFollowUpFormValues>({
    initialValues: {
      attemptedAt: toDatetimeLocalValue(new Date()),
      method: "PHONE",
      outcome: "NO_RESPONSE",
      notes: "",
    },
  });

  function handleSubmit() {
    setReviewMode(true);
  }

  async function confirmSubmit() {
    const values = form.values;
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
      setReviewMode(false);
      onClose();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to log bulk follow-up",
        color: "red",
      });
    }
  }

  return (
    <Modal opened={opened} onClose={() => { setReviewMode(false); onClose(); }} title={`Log Follow-Up for ${studentIds.length} Students`}>
      {!reviewMode ? (
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

            <div>
              <Text size="sm" fw={500} mb={4}>Date and time</Text>
              <input type="datetime-local" {...form.getInputProps("attemptedAt")} required style={{ padding: 8, width: "100%" }} />
            </div>
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
            <Button type="submit">Review and Confirm</Button>
          </Stack>
        </form>
      ) : (
        <Stack gap="md">
          <Alert color="yellow" variant="light">
            <Text fw={500} mb={4}>Confirm bulk follow-up</Text>
            <Text size="sm">You are about to log a follow-up attempt for:</Text>
            <List size="sm" spacing={2} mt="sm">
              {studentIds.slice(0, 8).map((id) => (
                <List.Item key={id}>{studentLabels.get(id) ?? `Student #${id}`}</List.Item>
              ))}
              {studentIds.length > 8 && <List.Item>and {studentIds.length - 8} more…</List.Item>}
            </List>
          </Alert>

          <Stack gap="xs" p="md" bg="var(--mantine-color-gray-0)" style={{ borderRadius: 8 }}>
            <Group justify="space-between">
              <Text size="sm"><b>Date/Time:</b></Text>
              <Text size="sm">{new Date(form.values.attemptedAt).toLocaleString()}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm"><b>Method:</b></Text>
              <Text size="sm">{form.values.method}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm"><b>Outcome:</b></Text>
              <Text size="sm">{form.values.outcome}</Text>
            </Group>
            {form.values.notes && (
              <Group justify="space-between">
                <Text size="sm"><b>Notes:</b></Text>
                <Text size="sm">{form.values.notes}</Text>
              </Group>
            )}
          </Stack>

          <Group justify="flex-end">
            <Button variant="light" onClick={() => setReviewMode(false)}>
              Back to Edit
            </Button>
            <Button onClick={confirmSubmit} loading={bulkCreate.isPending}>
              Yes, log for {studentIds.length} students
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
