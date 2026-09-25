import {
  Anchor,
  Button,
  Group,
  Loader,
  Modal,
<<<<<<< HEAD
  Pagination,
=======
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDebouncedValue, useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { type CreateEmployerInput, useCreateEmployer, useEmployers } from "../../api/employers";
import { usePermissions } from "../../auth/usePermissions";
import { Pager } from "../../components/Pager";

export function EmployersListPage() {
  const { canManageEmployers } = usePermissions();
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [debouncedSearch]);
  const { data, isLoading } = useEmployers(debouncedSearch || undefined, page);
  const [opened, { open, close }] = useDisclosure(false);
  const createEmployer = useCreateEmployer();

  const form = useForm<CreateEmployerInput>({
    initialValues: { name: "", industry: "", city: "", state: "" },
    validate: { name: (value) => (value.trim() ? null : "Name is required") },
  });

  async function handleSubmit(values: CreateEmployerInput) {
    try {
      await createEmployer.mutateAsync(values);
      notifications.show({ message: "Employer created", color: "green" });
      form.reset();
      close();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to create employer",
        color: "red",
      });
    }
  }

  return (
    <Stack p="xl" gap="md">
      <Group justify="space-between">
        <Title order={2}>Employers</Title>
        <Group>
          <Button variant="light" component={Link} to="/employers/analytics">
            View Analytics
          </Button>
<<<<<<< HEAD
          <Button onClick={open}>New Employer</Button>
=======
          {canManageEmployers && <Button onClick={open}>New Employer</Button>}
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
        </Group>
      </Group>

      <TextInput
        placeholder="Search by employer name..."
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        w={320}
      />

      {isLoading && <Loader />}

      {data && (
        <>
          <Text size="sm" c="dimmed">
            {data.pagination.totalItems} employer{data.pagination.totalItems === 1 ? "" : "s"}
          </Text>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Industry</Table.Th>
                <Table.Th>City/State</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.items.map((employer) => (
                <Table.Tr key={employer.id}>
                  <Table.Td>
                    <Anchor component={Link} to={`/employers/${employer.id}`}>
                      {employer.name}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>{employer.industry ?? "—"}</Table.Td>
                  <Table.Td>
                    {employer.city ?? "—"}
                    {employer.state ? `, ${employer.state}` : ""}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {data.pagination.totalPages > 1 && (
            <Group justify="center">
<<<<<<< HEAD
              <Pagination total={data.pagination.totalPages} value={page} onChange={setPage} />
=======
              <Pager total={data.pagination.totalPages} value={page} onChange={setPage} />
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
            </Group>
          )}
        </>
      )}

      <Modal opened={opened} onClose={close} title="New Employer">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <TextInput label="Name" required {...form.getInputProps("name")} />
            <TextInput label="Industry" {...form.getInputProps("industry")} />
            <TextInput label="City" {...form.getInputProps("city")} />
            <TextInput label="State" {...form.getInputProps("state")} />
            <Button type="submit" loading={createEmployer.isPending}>
              Create
            </Button>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
