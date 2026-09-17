import { FOLLOW_UP_METHODS, FOLLOW_UP_OUTCOMES } from "@outcomelink/shared";
import { Button, Group, Select, Stack, Table, Text, Textarea } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  type CreateFollowUpAttemptInput,
  useCreateFollowUpAttempt,
  useFollowUpAttempts,
} from "../../api/followups";
import { toDatetimeLocalValue } from "../../lib/forms";

export function FollowUpsTab({ studentId }: { studentId: number }) {
  const { data: attempts, isLoading } = useFollowUpAttempts(studentId);
  const createAttempt = useCreateFollowUpAttempt(studentId);
  const [formOpened, { toggle: toggleForm }] = useDisclosure(false);

  const form = useForm<CreateFollowUpAttemptInput>({
    initialValues: {
      attemptedAt: toDatetimeLocalValue(new Date()),
      method: "PHONE",
      outcome: "NO_RESPONSE",
      notes: "",
    },
  });

  async function handleSubmit(values: CreateFollowUpAttemptInput) {
    try {
      await createAttempt.mutateAsync({
        ...values,
        attemptedAt: new Date(values.attemptedAt).toISOString(),
      });
      notifications.show({ message: "Follow-up attempt recorded", color: "green" });
      form.reset();
      toggleForm();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to record follow-up attempt",
        color: "red",
      });
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={500}>Follow-up history</Text>
        <Button size="xs" variant="light" onClick={toggleForm}>
          {formOpened ? "Cancel" : "Record Attempt"}
        </Button>
      </Group>

      {formOpened && (
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="sm" p="md" bg="var(--mantine-color-default)" style={{ borderRadius: 8 }}>
            <input
              type="datetime-local"
              {...form.getInputProps("attemptedAt")}
              style={{ padding: 8 }}
            />
            <Select
              label="Method"
              data={FOLLOW_UP_METHODS.map((m) => ({ value: m, label: m }))}
              {...form.getInputProps("method")}
            />
            <Select
              label="Outcome"
              data={FOLLOW_UP_OUTCOMES.map((o) => ({ value: o, label: o }))}
              {...form.getInputProps("outcome")}
            />
            <Textarea label="Notes" {...form.getInputProps("notes")} />
            <Button type="submit" loading={createAttempt.isPending} size="sm">
              Save
            </Button>
          </Stack>
        </form>
      )}

      {isLoading && <Text size="sm">Loading...</Text>}

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Date</Table.Th>
            <Table.Th>Method</Table.Th>
            <Table.Th>Outcome</Table.Th>
            <Table.Th>Staff</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {attempts?.map((attempt) => (
            <Table.Tr key={attempt.id}>
              <Table.Td>{new Date(attempt.attemptedAt).toLocaleString()}</Table.Td>
              <Table.Td>{attempt.method}</Table.Td>
              <Table.Td>{attempt.outcome}</Table.Td>
              <Table.Td>{attempt.staffUser?.name ?? "—"}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
