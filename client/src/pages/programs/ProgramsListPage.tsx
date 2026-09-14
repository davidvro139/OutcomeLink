import {
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Table,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router-dom";
import {
  type CreateProgramInput,
  useCampuses,
  useCreateProgram,
  usePrograms,
} from "../../api/programs";
import { useAuth } from "../../auth/AuthContext";

const CAN_MANAGE = ["SYSTEM_ADMINISTRATOR"];

export function ProgramsListPage() {
  const { user } = useAuth();
  const { data, isLoading } = usePrograms();
  const { data: campuses } = useCampuses();
  const [opened, { open, close }] = useDisclosure(false);
  const createProgram = useCreateProgram();

  const form = useForm<CreateProgramInput>({
    initialValues: { campusId: 0, name: "", code: "", credentialType: "" },
    validate: {
      campusId: (value) => (value ? null : "Campus is required"),
      name: (value) => (value.trim() ? null : "Name is required"),
      code: (value) => (value.trim() ? null : "Code is required"),
      credentialType: (value) => (value.trim() ? null : "Credential type is required"),
    },
  });

  async function handleSubmit(values: CreateProgramInput) {
    try {
      await createProgram.mutateAsync(values);
      notifications.show({ message: "Program created", color: "green" });
      form.reset();
      close();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to create program",
        color: "red",
      });
    }
  }

  return (
    <Stack p="xl" gap="md">
      <Group justify="space-between">
        <Title order={2}>Programs</Title>
        {user && CAN_MANAGE.includes(user.role) && <Button onClick={open}>New Program</Button>}
      </Group>

      {isLoading && <Loader />}

      {data && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Code</Table.Th>
              <Table.Th>Credential</Table.Th>
              <Table.Th>Licensure Required</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.items.map((program) => (
              <Table.Tr key={program.id}>
                <Table.Td>
                  <Link to={`/programs/${program.id}`}>{program.name}</Link>
                </Table.Td>
                <Table.Td>{program.code}</Table.Td>
                <Table.Td>{program.credentialType}</Table.Td>
                <Table.Td>{program.licensureRequired ? "Yes" : "No"}</Table.Td>
                <Table.Td>
                  <Badge color={program.active ? "green" : "gray"}>
                    {program.active ? "Active" : "Inactive"}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={opened} onClose={close} title="New Program">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <Select
              label="Campus"
              placeholder="Select a campus"
              required
              data={campuses?.items.map((c) => ({ value: String(c.id), label: c.name })) ?? []}
              value={form.values.campusId ? String(form.values.campusId) : null}
              onChange={(value) => form.setFieldValue("campusId", value ? Number(value) : 0)}
              error={form.errors.campusId}
            />
            <TextInput label="Name" required {...form.getInputProps("name")} />
            <TextInput label="Code" required {...form.getInputProps("code")} />
            <TextInput
              label="Credential type"
              placeholder="Diploma, Certificate, Degree..."
              required
              {...form.getInputProps("credentialType")}
            />
            <Button type="submit" loading={createProgram.isPending}>
              Create
            </Button>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
