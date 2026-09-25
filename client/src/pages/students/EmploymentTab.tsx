<<<<<<< HEAD
import { Button, Checkbox, Group, Modal, Select, Stack, Table, Text, TextInput } from "@mantine/core";
=======
import {
  Button,
  Checkbox,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import {
  type CreateEmployerInput,
  type Employer,
  useCreateEmployer,
  useEmployers,
} from "../../api/employers";
import {
  type CreateEmploymentRecordInput,
  useCreateEmploymentRecord,
  useEmploymentRecords,
} from "../../api/placements";
import { EvidencePanel } from "../../components/EvidencePanel";
import { usePermissions } from "../../auth/usePermissions";

export function EmploymentTab({ studentId }: { studentId: number }) {
  const { canWrite, canManageEmployers } = usePermissions();
  const { data: records, isLoading } = useEmploymentRecords(studentId);
  const { data: employers } = useEmployers();
  const createRecord = useCreateEmploymentRecord(studentId);
  const createEmployer = useCreateEmployer();
  const [formOpened, { toggle: toggleForm }] = useDisclosure(false);
  const [employerModalOpened, { open: openEmployerModal, close: closeEmployerModal }] =
    useDisclosure(false);
  const [expandedRecordId, setExpandedRecordId] = useState<number | null>(null);
  // The Employer Select's data comes from a single paginated (50-item,
  // alphabetical) page of employers — a just-created employer very often
  // sorts past that page and wouldn't appear there even after the list
  // refetches. Tracked separately so it's always selectable regardless of
  // where it lands once the full list catches up.
  const [justCreatedEmployer, setJustCreatedEmployer] = useState<Employer | null>(null);

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

  const employerForm = useForm<CreateEmployerInput>({
    initialValues: { name: "", industry: "", city: "", state: "" },
    validate: { name: (value) => (value.trim() ? null : "Name is required") },
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

  async function handleCreateEmployer(values: CreateEmployerInput) {
    try {
      const { employer } = await createEmployer.mutateAsync(values);
      notifications.show({ message: "Employer created", color: "green" });
      setJustCreatedEmployer(employer);
      form.setFieldValue("employerId", employer.id);
      employerForm.reset();
      closeEmployerModal();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to create employer",
        color: "red",
      });
    }
  }

  const employerOptions = [
    ...(justCreatedEmployer && !employers?.items.some((e) => e.id === justCreatedEmployer.id)
      ? [justCreatedEmployer]
      : []),
    ...(employers?.items ?? []),
  ].map((e) => ({ value: String(e.id), label: e.name }));

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={500}>Employment history</Text>
        {canWrite && (
          <Button size="xs" variant="light" onClick={toggleForm}>
            {formOpened ? "Cancel" : "Log Employment"}
          </Button>
        )}
      </Group>

      {formOpened && (
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="sm" p="md" bg="var(--mantine-color-default)" style={{ borderRadius: 8 }}>
            <Group align="flex-end" gap="xs">
              <Select
                label="Employer"
                required
                data={employerOptions}
                value={form.values.employerId ? String(form.values.employerId) : null}
                onChange={(v) => form.setFieldValue("employerId", v ? Number(v) : 0)}
                searchable
                style={{ flex: 1 }}
              />
<<<<<<< HEAD
              <Button variant="light" size="sm" onClick={openEmployerModal}>
                New employer
              </Button>
=======
              {canManageEmployers && (
                <Button variant="light" size="sm" onClick={openEmployerModal}>
                  New employer
                </Button>
              )}
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
            </Group>
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

      <Modal opened={employerModalOpened} onClose={closeEmployerModal} title="New Employer">
        <form onSubmit={employerForm.onSubmit(handleCreateEmployer)}>
          <Stack gap="md">
            <TextInput label="Name" required {...employerForm.getInputProps("name")} />
            <TextInput label="Industry" {...employerForm.getInputProps("industry")} />
            <TextInput label="City" {...employerForm.getInputProps("city")} />
            <TextInput label="State" {...employerForm.getInputProps("state")} />
            <Button type="submit" loading={createEmployer.isPending}>
              Create
            </Button>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
