import {
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useParams } from "react-router-dom";
import { type CreateContactInput, useCreateContact, useEmployer } from "../../api/employers";
import { AuditHistory } from "../../components/AuditHistory";
import { stripEmptyStrings } from "../../lib/forms";
import { EmployerLocationPanel } from "./EmployerLocationPanel";

export function EmployerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const employerId = Number(id);
  const { data: employer, isLoading } = useEmployer(employerId);
  const createContact = useCreateContact(employerId);
  const [opened, { open, close }] = useDisclosure(false);

  const form = useForm<CreateContactInput>({
    initialValues: { name: "", title: "", email: "", phone: "", isVerificationContact: false },
    validate: { name: (value) => (value.trim() ? null : "Name is required") },
  });

  async function handleSubmit(values: CreateContactInput) {
    try {
      await createContact.mutateAsync(stripEmptyStrings(values) as CreateContactInput);
      notifications.show({ message: "Contact added", color: "green" });
      form.reset();
      close();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to add contact",
        color: "red",
      });
    }
  }

  if (isLoading) return <Loader m="xl" />;
  if (!employer) return null;

  return (
    <Stack p="xl" gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={2}>{employer.name}</Title>
          <Text c="dimmed">{employer.industry ?? "Industry not on file"}</Text>
        </div>
        <Badge color={employer.active ? "green" : "gray"}>
          {employer.active ? "Active" : "Inactive"}
        </Badge>
      </Group>

      <Group justify="space-between">
        <Text fw={500}>Contacts</Text>
        <Button size="xs" variant="light" onClick={open}>
          Add Contact
        </Button>
      </Group>

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Title</Table.Th>
            <Table.Th>Email</Table.Th>
            <Table.Th>Phone</Table.Th>
            <Table.Th>Verification Contact</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {employer.contacts?.map((contact) => (
            <Table.Tr key={contact.id}>
              <Table.Td>{contact.name}</Table.Td>
              <Table.Td>{contact.title ?? "—"}</Table.Td>
              <Table.Td>{contact.email ?? "—"}</Table.Td>
              <Table.Td>{contact.phone ?? "—"}</Table.Td>
              <Table.Td>{contact.isVerificationContact ? "Yes" : "No"}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <EmployerLocationPanel key={`${employer.id}:${employer.city}:${employer.state}`} employer={employer} />
      <AuditHistory entityType="Employer" entityId={employerId} />

      <Modal opened={opened} onClose={close} title="Add Contact">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <TextInput label="Name" required {...form.getInputProps("name")} />
            <TextInput label="Title" {...form.getInputProps("title")} />
            <TextInput label="Email" type="email" {...form.getInputProps("email")} />
            <TextInput label="Phone" {...form.getInputProps("phone")} />
            <Checkbox
              label="Verification contact"
              checked={form.values.isVerificationContact ?? false}
              onChange={(e) => form.setFieldValue("isVerificationContact", e.currentTarget.checked)}
            />
            <Button type="submit" loading={createContact.isPending}>
              Save
            </Button>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
