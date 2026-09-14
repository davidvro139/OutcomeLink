import { Button, Checkbox, Group, Select, Stack, Table, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { useEmployers } from "../../api/employers";
import {
  type CreateEmploymentRecordInput,
  useCreateEmploymentRecord,
  useEmploymentRecords,
} from "../../api/placements";
import { EvidencePanel } from "../../components/EvidencePanel";

export function EmploymentTab({ studentId }: { studentId: number }) {
  const { data: records, isLoading } = useEmploymentRecords(studentId);
  const { data: employers } = useEmployers();
  const createRecord = useCreateEmploymentRecord(studentId);
  const [formOpened, { toggle: toggleForm }] = useDisclosure(false);
  const [expandedRecordId, setExpandedRecordId] = useState<number | null>(null);

  const form = useForm<CreateEmploymentRecordInput>({
    initialValues: {
      employerId: 0,
      jobTitle: "",
      startDate: "",
      fullTime: true,
      relatedToTraining: true,
      employmentStatus: "Employed",
    },
    validate: {
      employerId: (value) => (value ? null : "Employer is required"),
      jobTitle: (value) => (value.trim() ? null : "Job title is required"),
      startDate: (value) => (value ? null : "Start date is required"),
    },
  });

  async function handleSubmit(values: CreateEmploymentRecordInput) {
    try {
      await createRecord.mutateAsync(values);
      notifications.show({ message: "Employment record saved", color: "green" });
      form.reset();
      toggleForm();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to save employment record",
        color: "red",
      });
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={500}>Employment history</Text>
        <Button size="xs" variant="light" onClick={toggleForm}>
          {formOpened ? "Cancel" : "Log Employment"}
        </Button>
      </Group>

      {formOpened && (
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="sm" p="md" bg="gray.0" style={{ borderRadius: 8 }}>
            <Select
              label="Employer"
              required
              data={employers?.items.map((e) => ({ value: String(e.id), label: e.name })) ?? []}
              value={form.values.employerId ? String(form.values.employerId) : null}
              onChange={(v) => form.setFieldValue("employerId", v ? Number(v) : 0)}
            />
            <TextInput label="Job title" required {...form.getInputProps("jobTitle")} />
            <input type="date" {...form.getInputProps("startDate")} style={{ padding: 8 }} />
            <Checkbox
              label="Full-time"
              checked={form.values.fullTime}
              onChange={(e) => form.setFieldValue("fullTime", e.currentTarget.checked)}
            />
            <Checkbox
              label="Related to training"
              checked={form.values.relatedToTraining}
              onChange={(e) => form.setFieldValue("relatedToTraining", e.currentTarget.checked)}
            />
            <TextInput label="Employment status" {...form.getInputProps("employmentStatus")} />
            <Button type="submit" loading={createRecord.isPending} size="sm">
              Save
            </Button>
          </Stack>
        </form>
      )}

      {isLoading && <Text size="sm">Loading...</Text>}

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Employer</Table.Th>
            <Table.Th>Job Title</Table.Th>
            <Table.Th>Start</Table.Th>
            <Table.Th>Related</Table.Th>
            <Table.Th>Verification</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {records?.map((record) => (
            <Table.Tr
              key={record.id}
              onClick={() => setExpandedRecordId(expandedRecordId === record.id ? null : record.id)}
              style={{ cursor: "pointer" }}
            >
              <Table.Td>{record.employer?.name ?? record.employerId}</Table.Td>
              <Table.Td>{record.jobTitle}</Table.Td>
              <Table.Td>{new Date(record.startDate).toLocaleDateString()}</Table.Td>
              <Table.Td>{record.relatedToTraining ? "Yes" : "No"}</Table.Td>
              <Table.Td>{record.verificationStatus ?? "Unverified"}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      {expandedRecordId && <EvidencePanel target={{ employmentRecordId: expandedRecordId }} />}
    </Stack>
  );
}
