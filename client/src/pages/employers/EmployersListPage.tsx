import {
  Anchor,
  Button,
  Chip,
  Group,
  Loader,
  Modal,
  Pagination,
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
import { SortableTableHeader } from "../../components/SortableTableHeader";
import type { SortDirection } from "../../lib/sorting";

export function EmployersListPage() {
  const { canManageEmployers } = usePermissions();
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<string | null>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  useEffect(() => setPage(1), [debouncedSearch]);
  const { data, isLoading } = useEmployers(
    debouncedSearch || undefined,
    page,
    sortField || undefined,
    sortDirection,
  );
  const [opened, { open, close }] = useDisclosure(false);
  const createEmployer = useCreateEmployer();

  const handleSort = (field: string, direction: SortDirection) => {
    setSortField(field);
    setSortDirection(direction);
    setPage(1);
  };

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
          {canManageEmployers && <Button onClick={open}>New Employer</Button>}
        </Group>
      </Group>

      <Group gap="md" align="flex-end">
        <TextInput
          placeholder="Search by employer name..."
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          w={320}
        />
        {search && (
          <Chip
            icon="✕"
            checked={false}
            onChange={() => setSearch("")}
            variant="light"
            size="sm"
          >
            Clear search
          </Chip>
        )}
      </Group>

      {isLoading && <Loader />}

      {data && (
        <>
          <Text size="sm" c="dimmed">
            {data.pagination.totalItems} employer{data.pagination.totalItems === 1 ? "" : "s"}
          </Text>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>
                  <SortableTableHeader
                    field="name"
                    label="Name"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                </Table.Th>
                <Table.Th>
                  <SortableTableHeader
                    field="industry"
                    label="Industry"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                </Table.Th>
                <Table.Th>
                  <SortableTableHeader
                    field="city"
                    label="City"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                </Table.Th>
                <Table.Th>
                  <SortableTableHeader
                    field="state"
                    label="State"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                </Table.Th>
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
                  <Table.Td>{employer.city ?? "—"}</Table.Td>
                  <Table.Td>{employer.state ?? "—"}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {data.pagination.totalPages > 1 && (
            <Group justify="center" align="center" gap="xl">
              <Pagination total={data.pagination.totalPages} value={page} onChange={setPage} />
              <Text size="sm" c="dimmed">
                Page {page} of {data.pagination.totalPages}
              </Text>
            </Group>
          )}
        </>
      )}

      {data && data.pagination.totalItems === 0 && (
        <Text c="dimmed" ta="center" py="xl">
          {debouncedSearch ? "No employers match your search." : "No employers yet. Click \"New Employer\" to add one."}
        </Text>
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
