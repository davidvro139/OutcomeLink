import { LICENSURE_RESULT_STATUSES } from "@outcomelink/shared";
import { Button, Group, Select, Stack, Table, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  type CreateLicensureResultInput,
  useCreateLicensureResult,
  useLicensureResults,
  useUpdateLicensureResult,
} from "../../api/licensure";
import { usePrograms } from "../../api/programs";
<<<<<<< HEAD
=======
import { usePermissions } from "../../auth/usePermissions";
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a

const RESULT_COLORS: Record<string, string> = {
  PASSED: "green",
  FAILED: "red",
  WAITING: "yellow",
  SCHEDULED: "blue",
  UNKNOWN: "gray",
};

export function LicensureTab({ studentId }: { studentId: number }) {
<<<<<<< HEAD
=======
  const { canWrite } = usePermissions();
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
  const { data: results, isLoading } = useLicensureResults(studentId);
  const { data: programs } = usePrograms();
  const createResult = useCreateLicensureResult(studentId);
  const updateResult = useUpdateLicensureResult(studentId);
  const [formOpened, { toggle: toggleForm }] = useDisclosure(false);

  const licensureRequiredPrograms = programs?.items.filter((p) => p.licensureRequired) ?? [];

  const form = useForm<CreateLicensureResultInput>({
    initialValues: { programId: 0, examName: "", result: "SCHEDULED" },
    validate: {
      programId: (value) => (value ? null : "Program is required"),
      examName: (value) => (value.trim() ? null : "Exam name is required"),
    },
  });

  async function handleSubmit(values: CreateLicensureResultInput) {
    try {
      await createResult.mutateAsync(values);
      notifications.show({ message: "Licensure attempt recorded", color: "green" });
      form.reset();
      toggleForm();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to record licensure attempt",
        color: "red",
      });
    }
  }

  async function handleResultChange(id: number, result: string | null) {
    if (!result) return;
    try {
<<<<<<< HEAD
      await updateResult.mutateAsync({ id, input: { result: result as CreateLicensureResultInput["result"] } });
=======
      await updateResult.mutateAsync({
        id,
        input: { result: result as CreateLicensureResultInput["result"] },
      });
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
      notifications.show({ message: "Licensure result updated", color: "green" });
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to update licensure result",
        color: "red",
      });
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={500}>Licensure attempts</Text>
<<<<<<< HEAD
        <Button size="xs" variant="light" onClick={toggleForm}>
          {formOpened ? "Cancel" : "Record Attempt"}
        </Button>
=======
        {canWrite && (
          <Button size="xs" variant="light" onClick={toggleForm}>
            {formOpened ? "Cancel" : "Record Attempt"}
          </Button>
        )}
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
      </Group>

      {formOpened && (
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="sm" p="md" bg="var(--mantine-color-default)" style={{ borderRadius: 8 }}>
            <Select
              label="Program"
              required
              description="Only licensure-required programs are listed"
              data={licensureRequiredPrograms.map((p) => ({ value: String(p.id), label: p.name }))}
              value={form.values.programId ? String(form.values.programId) : null}
              onChange={(v) => form.setFieldValue("programId", v ? Number(v) : 0)}
            />
            <TextInput label="Exam name" required {...form.getInputProps("examName")} />
            <Group grow>
              <div>
                <Text size="sm" fw={500} mb={4}>
                  Scheduled date
                </Text>
                <input
                  type="date"
                  {...form.getInputProps("scheduledDate")}
                  style={{ padding: 8, width: "100%" }}
                />
              </div>
              <div>
                <Text size="sm" fw={500} mb={4}>
                  Exam date
                </Text>
                <input
                  type="date"
                  {...form.getInputProps("examDate")}
                  style={{ padding: 8, width: "100%" }}
                />
              </div>
            </Group>
            <Select
              label="Result"
              data={LICENSURE_RESULT_STATUSES.map((s) => ({ value: s, label: s }))}
              {...form.getInputProps("result")}
              allowDeselect={false}
            />
            <Button type="submit" loading={createResult.isPending} size="sm">
              Save Attempt
            </Button>
          </Stack>
        </form>
      )}

      {isLoading && <Text size="sm">Loading...</Text>}

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Program</Table.Th>
            <Table.Th>Exam</Table.Th>
            <Table.Th>Attempt</Table.Th>
            <Table.Th>Scheduled</Table.Th>
            <Table.Th>Exam Date</Table.Th>
            <Table.Th>Result</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {results?.map((result) => (
            <Table.Tr key={result.id}>
              <Table.Td>{result.program?.name ?? result.programId}</Table.Td>
              <Table.Td>{result.examName}</Table.Td>
              <Table.Td>{result.attemptNumber}</Table.Td>
              <Table.Td>
                {result.scheduledDate ? new Date(result.scheduledDate).toLocaleDateString() : "—"}
              </Table.Td>
              <Table.Td>
                {result.examDate ? new Date(result.examDate).toLocaleDateString() : "—"}
              </Table.Td>
              <Table.Td>
<<<<<<< HEAD
                <Select
                  size="xs"
                  w={140}
                  data={LICENSURE_RESULT_STATUSES.map((s) => ({ value: s, label: s }))}
                  value={result.result}
                  onChange={(v) => handleResultChange(result.id, v)}
                  allowDeselect={false}
                  styles={{ input: { color: `var(--mantine-color-${RESULT_COLORS[result.result]}-4)` } }}
                />
=======
                {!canWrite ? (
                  <Text size="sm" c={RESULT_COLORS[result.result]}>
                    {result.result}
                  </Text>
                ) : (
                  <Select
                    size="xs"
                    w={140}
                    aria-label={`Result for ${result.examName}, attempt ${result.attemptNumber}`}
                    data={LICENSURE_RESULT_STATUSES.map((s) => ({ value: s, label: s }))}
                    value={result.result}
                    onChange={(v) => handleResultChange(result.id, v)}
                    allowDeselect={false}
                    styles={{
                      input: { color: `var(--mantine-color-${RESULT_COLORS[result.result]}-4)` },
                    }}
                  />
                )}
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {results?.length === 0 && (
        <Text size="sm" c="dimmed">
          No licensure attempts recorded yet.
        </Text>
      )}
    </Stack>
  );
}
