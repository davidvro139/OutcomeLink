import { EVIDENCE_TYPES } from "@outcomelink/shared";
import { Alert, Button, FileInput, Group, Paper, Select, Table, Text } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  type EvidenceTarget,
  openEvidenceFile,
  useEvidenceList,
  useUploadEvidence,
} from "../api/evidence";

interface UploadFormValues {
  file: File | null;
  evidenceType: (typeof EVIDENCE_TYPES)[number] | null;
}

/** Evidence upload/list for whichever record it's attached to — spec §14. */
export function EvidencePanel({ target }: { target: EvidenceTarget }) {
  const { data: evidence, isLoading } = useEvidenceList(target);
  const upload = useUploadEvidence(target);

  const form = useForm<UploadFormValues>({
    initialValues: { file: null, evidenceType: null },
    validate: {
      file: (value) => (value ? null : "A file is required"),
      evidenceType: (value) => (value ? null : "Evidence type is required"),
    },
  });

  async function handleSubmit(values: UploadFormValues) {
    if (!values.file || !values.evidenceType) return;
    try {
      await upload.mutateAsync({ file: values.file, evidenceType: values.evidenceType });
      notifications.show({ message: "Evidence uploaded", color: "green" });
      form.reset();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to upload evidence",
        color: "red",
      });
    }
  }

  async function handleView(id: number) {
    try {
      await openEvidenceFile(id);
    } catch {
      notifications.show({ message: "Failed to open evidence file", color: "red" });
    }
  }

  return (
    <Paper withBorder p="md" radius="md">
      <Text fw={500} mb="sm">
        Evidence
      </Text>

      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Group align="flex-end">
          <Select
            label="Type"
            data={EVIDENCE_TYPES.map((t) => ({ value: t, label: t }))}
            {...form.getInputProps("evidenceType")}
            w={220}
          />
          <FileInput
            label="File"
            placeholder="Choose a file"
            value={form.values.file}
            onChange={(file) => form.setFieldValue("file", file)}
            w={220}
          />
          <Button type="submit" loading={upload.isPending}>
            Upload
          </Button>
        </Group>
      </form>

      {isLoading && <Text size="sm">Loading...</Text>}

      {evidence && evidence.length === 0 && (
        <Alert mt="md" color="yellow" title="No evidence on file">
          This outcome has no supporting evidence yet.
        </Alert>
      )}

      {evidence && evidence.length > 0 && (
        <Table mt="md">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Type</Table.Th>
              <Table.Th>Description</Table.Th>
              <Table.Th>Uploaded By</Table.Th>
              <Table.Th></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {evidence.map((item) => (
              <Table.Tr key={item.id}>
                <Table.Td>{item.evidenceType}</Table.Td>
                <Table.Td>{item.description ?? "—"}</Table.Td>
                <Table.Td>{item.uploadedBy}</Table.Td>
                <Table.Td>
                  <Button size="xs" variant="subtle" onClick={() => handleView(item.id)}>
                    View
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Paper>
  );
}
