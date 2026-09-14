import { Button, Group, Loader, Modal, Stack, Table, TextInput, Title } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDebouncedValue, useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { Link } from "react-router-dom";
import { type CreateStudentInput, useCreateStudent, useStudents } from "../../api/students";
import { stripEmptyStrings } from "../../lib/forms";

export function StudentsListPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const { data, isLoading } = useStudents(debouncedSearch || undefined);
  const [opened, { open, close }] = useDisclosure(false);
  const createStudent = useCreateStudent();

  const form = useForm<CreateStudentInput>({
    initialValues: { internalStudentId: "", firstName: "", lastName: "", email: "" },
    validate: {
      internalStudentId: (value) => (value.trim() ? null : "Internal student ID is required"),
      firstName: (value) => (value.trim() ? null : "First name is required"),
      lastName: (value) => (value.trim() ? null : "Last name is required"),
    },
  });

  async function handleSubmit(values: CreateStudentInput) {
    try {
      await createStudent.mutateAsync(stripEmptyStrings(values) as CreateStudentInput);
      notifications.show({ message: "Student created", color: "green" });
      form.reset();
      close();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to create student",
        color: "red",
      });
    }
  }

  return (
    <Stack p="xl" gap="md">
      <Group justify="space-between">
        <Title order={2}>Students</Title>
        <Button onClick={open}>New Student</Button>
      </Group>

      <TextInput
        placeholder="Search by name or student ID..."
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        w={320}
      />

      {isLoading && <Loader />}

      {data && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Student ID</Table.Th>
              <Table.Th>Email</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.items.map((student) => (
              <Table.Tr key={student.id}>
                <Table.Td>
                  <Link to={`/students/${student.id}`}>
                    {student.firstName} {student.lastName}
                  </Link>
                </Table.Td>
                <Table.Td>{student.internalStudentId}</Table.Td>
                <Table.Td>{student.email ?? "—"}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={opened} onClose={close} title="New Student">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <TextInput
              label="Internal Student ID"
              required
              {...form.getInputProps("internalStudentId")}
            />
            <TextInput label="First name" required {...form.getInputProps("firstName")} />
            <TextInput label="Last name" required {...form.getInputProps("lastName")} />
            <TextInput label="Email" type="email" {...form.getInputProps("email")} />
            <Button type="submit" loading={createStudent.isPending}>
              Create
            </Button>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
