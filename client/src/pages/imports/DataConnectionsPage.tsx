import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  PasswordInput,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import {
  type ConnectionInput,
  type DataSourceConnection,
  useCreateDataConnection,
  useDataConnections,
  useDeleteDataConnection,
  useFetchImportBatch,
  useTestDataConnection,
  useUpdateDataConnection,
} from "../../api/dataConnections";

// Matches server/src/modules/imports/imports.routes.ts's CAN_MANAGE_CONNECTIONS
// — configuring a connection means handing this app a live external
// credential, a higher bar than the CAN_IMPORT set the rest of Bulk Import uses.
const CAN_MANAGE_CONNECTIONS = ["SYSTEM_ADMINISTRATOR", "INSTITUTIONAL_ADMINISTRATOR"];

const EMPTY_FORM: ConnectionInput = {
  name: "",
  environmentUrl: "",
  tenantId: "",
  clientId: "",
  clientSecret: "",
  entityLogicalName: "",
};

function ConnectionFormFields({
  form,
  onChange,
  isEdit,
}: {
  form: ConnectionInput;
  onChange: (form: ConnectionInput) => void;
  isEdit: boolean;
}) {
  return (
    <Stack gap="md">
      <TextInput
        label="Connection name"
        placeholder="OneWorld Production"
        required
        value={form.name}
        onChange={(e) => onChange({ ...form, name: e.currentTarget.value })}
      />
      <TextInput
        label="Environment URL"
        placeholder="https://org12345.crm.dynamics.com"
        description="The Dataverse/Dynamics 365 environment's base URL"
        required
        value={form.environmentUrl}
        onChange={(e) => onChange({ ...form, environmentUrl: e.currentTarget.value })}
      />
      <TextInput
        label="Tenant ID"
        description="Azure AD (Entra ID) tenant ID for the app registration"
        required
        value={form.tenantId}
        onChange={(e) => onChange({ ...form, tenantId: e.currentTarget.value })}
      />
      <TextInput
        label="Client ID"
        description="The app registration's application (client) ID"
        required
        value={form.clientId}
        onChange={(e) => onChange({ ...form, clientId: e.currentTarget.value })}
      />
      <PasswordInput
        label="Client secret"
        description={isEdit ? "Leave blank to keep the current secret" : undefined}
        required={!isEdit}
        value={form.clientSecret ?? ""}
        onChange={(e) => onChange({ ...form, clientSecret: e.currentTarget.value })}
      />
      <TextInput
        label="Entity (table) logical name"
        placeholder="new_students"
        description="The Dataverse table this connection pulls rows from — one connection per table"
        required
        value={form.entityLogicalName}
        onChange={(e) => onChange({ ...form, entityLogicalName: e.currentTarget.value })}
      />
    </Stack>
  );
}

/**
 * Live external data-source connections for Bulk Import (Phase 3
 * "SIS/API integrations") — currently Microsoft Dataverse/Power Platform
 * only (e.g. OneWorld SIS), reached via Dataverse's OData Web API and an
 * Azure AD app registration's client-credentials OAuth2 flow. "Fetch Now"
 * pulls the configured table's rows live and hands off to the exact same
 * upload-wizard page (map/validate/preview/commit) a file upload would use.
 */
export function DataConnectionsPage() {
  const { user } = useAuth();
  const canManage = !!user && CAN_MANAGE_CONNECTIONS.includes(user.role);
  const navigate = useNavigate();

  const { data: connections, isLoading } = useDataConnections();
  const createConnection = useCreateDataConnection();
  const updateConnection = useUpdateDataConnection();
  const deleteConnection = useDeleteDataConnection();
  const testConnection = useTestDataConnection();
  const fetchBatch = useFetchImportBatch();

  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ConnectionInput>(EMPTY_FORM);

  if (!canManage) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        You don't have access to this page.
      </Text>
    );
  }

  function openCreateModal() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    openModal();
  }

  function openEditModal(connection: DataSourceConnection) {
    setEditingId(connection.id);
    setForm({
      name: connection.name,
      environmentUrl: connection.environmentUrl,
      tenantId: connection.tenantId,
      clientId: connection.clientId,
      clientSecret: "",
      entityLogicalName: connection.entityLogicalName,
    });
    openModal();
  }

  async function handleSave() {
    try {
      if (editingId) {
        const input = { ...form };
        if (!input.clientSecret) delete input.clientSecret;
        await updateConnection.mutateAsync({ id: editingId, input });
        notifications.show({ message: "Connection updated", color: "green" });
      } else {
        await createConnection.mutateAsync(form);
        notifications.show({ message: "Connection created", color: "green" });
      }
      closeModal();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to save connection",
        color: "red",
      });
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteConnection.mutateAsync(id);
      notifications.show({ message: "Connection deleted", color: "green" });
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to delete connection",
        color: "red",
      });
    }
  }

  async function handleTest(id: number) {
    try {
      const result = await testConnection.mutateAsync(id);
      notifications.show({
        message: result.success
          ? `Connection successful — found columns: ${result.sampleColumns?.join(", ") ?? "(none)"}`
          : `Connection failed: ${result.error}`,
        color: result.success ? "green" : "red",
        autoClose: result.success ? 5000 : false,
      });
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to test connection",
        color: "red",
      });
    }
  }

  async function handleFetch(id: number) {
    try {
      const result = await fetchBatch.mutateAsync(id);
      notifications.show({ message: `Fetched ${result.batch.totalRows} rows`, color: "green" });
      navigate(`/imports/${result.batch.id}`);
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to fetch data",
        color: "red",
      });
    }
  }

  const isSaveDisabled =
    !form.name.trim() ||
    !form.environmentUrl.trim() ||
    !form.tenantId.trim() ||
    !form.clientId.trim() ||
    !form.entityLogicalName.trim() ||
    (!editingId && !form.clientSecret?.trim());

  return (
    <Stack p="xl" gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={2}>Data Source Connections</Title>
          <Text c="dimmed">
            Pull data live from an external system instead of uploading a file — currently supports
            Microsoft Dataverse/Power Platform systems (e.g. OneWorld SIS).{" "}
            <Anchor component={Link} to="/imports">
              Back to Bulk Import
            </Anchor>
          </Text>
        </div>
        <Button onClick={openCreateModal}>Add Connection</Button>
      </Group>

      <Alert color="blue" variant="light">
        This has not been tested against a real OneWorld/Dataverse environment — only against
        Microsoft's documented Azure AD and Dataverse API contracts. The first real connection should
        expect to need the exact tenant/environment/table details from your Azure AD app registration.
      </Alert>

      {isLoading && <Loader />}

      {connections && connections.length === 0 && (
        <Text c="dimmed" ta="center" py="xl">
          No connections yet. Click "Add Connection" to configure one.
        </Text>
      )}

      {connections && connections.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Environment</Table.Th>
              <Table.Th>Entity</Table.Th>
              <Table.Th>Last tested</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {connections.map((c) => (
              <Table.Tr key={c.id}>
                <Table.Td>{c.name}</Table.Td>
                <Table.Td>{c.environmentUrl}</Table.Td>
                <Table.Td>{c.entityLogicalName}</Table.Td>
                <Table.Td>
                  {c.lastTestedAt ? (
                    <Group gap={6}>
                      <Badge color={c.lastTestStatus === "SUCCESS" ? "green" : "red"} size="sm">
                        {c.lastTestStatus}
                      </Badge>
                      <Text size="xs" c="dimmed">
                        {new Date(c.lastTestedAt).toLocaleString()}
                      </Text>
                    </Group>
                  ) : (
                    <Text size="xs" c="dimmed">
                      Never tested
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button size="xs" variant="light" onClick={() => handleTest(c.id)} loading={testConnection.isPending}>
                      Test
                    </Button>
                    <Button size="xs" variant="light" color="teal" onClick={() => handleFetch(c.id)} loading={fetchBatch.isPending}>
                      Fetch Now
                    </Button>
                    <Button size="xs" variant="subtle" onClick={() => openEditModal(c)}>
                      Edit
                    </Button>
                    <Button size="xs" variant="subtle" color="red" onClick={() => handleDelete(c.id)}>
                      Delete
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={modalOpened} onClose={closeModal} title={editingId ? "Edit Connection" : "Add Connection"} size="lg">
        <Stack gap="md">
          <ConnectionFormFields form={form} onChange={setForm} isEdit={!!editingId} />
          <Button
            onClick={handleSave}
            loading={createConnection.isPending || updateConnection.isPending}
            disabled={isSaveDisabled}
          >
            Save
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
