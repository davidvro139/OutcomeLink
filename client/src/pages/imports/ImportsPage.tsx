import { IMPORT_ACCEPTED_FILE_EXTENSIONS } from "@outcomelink/shared";
import { Anchor, Badge, Button, FileInput, Group, Loader, Modal, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { type ImportBatch, useImportBatches, useUploadImportBatch } from "../../api/imports";

// Matches imports.routes.ts's CAN_MANAGE_CONNECTIONS.
const CAN_MANAGE_CONNECTIONS = ["SYSTEM_ADMINISTRATOR", "INSTITUTIONAL_ADMINISTRATOR"];

const STATUS_COLORS: Record<string, string> = {
  UPLOADED: "gray",
  MAPPED: "blue",
  VALIDATED: "yellow",
  PREVIEWED: "grape",
  IMPORTED: "green",
  FAILED: "red",
};

/**
 * Phase 2 P12 (docs/TODO.md): bulk student/enrollment import — batch history
 * and entry point into the upload wizard. Accepts CSV or Excel (spec §51).
 */
export function ImportsPage() {
  const { user } = useAuth();
  const canManageConnections = !!user && CAN_MANAGE_CONNECTIONS.includes(user.role);
  const { data: batches, isLoading } = useImportBatches();
  const upload = useUploadImportBatch();
  const navigate = useNavigate();
  const [opened, { open, close }] = useDisclosure(false);
  const [sourceSystem, setSourceSystem] = useState("");
  const [file, setFile] = useState<File | null>(null);

  async function handleUpload() {
    if (!file || !sourceSystem.trim()) return;
    try {
      const result = await upload.mutateAsync({ file, sourceSystem: sourceSystem.trim() });
      notifications.show({ message: "File uploaded — set up the column mapping next", color: "green" });
      close();
      setSourceSystem("");
      setFile(null);
      navigate(`/imports/${result.batch.id}`);
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to upload file",
        color: "red",
      });
    }
  }

  return (
    <Stack p="xl" gap="md">
      <Group justify="space-between">
        <Title order={2}>Bulk Import</Title>
        <Group gap="xs">
          {canManageConnections && (
            <Button variant="light" component={Link} to="/imports/connections">
              Data Source Connections
            </Button>
          )}
          <Button onClick={open}>New Import</Button>
        </Group>
      </Group>

      {isLoading && <Loader />}

      {batches && batches.length === 0 && (
        <Text c="dimmed" ta="center" py="xl">
          No imports yet. Click "New Import" to upload a roster or term export.
        </Text>
      )}

      {batches && batches.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>File</Table.Th>
              <Table.Th>Source System</Table.Th>
              <Table.Th>Uploaded</Table.Th>
              <Table.Th>Uploaded By</Table.Th>
              <Table.Th>Rows</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {batches.map((batch: ImportBatch) => (
              <Table.Tr key={batch.id}>
                <Table.Td>
                  <Anchor component={Link} to={`/imports/${batch.id}`}>
                    {batch.originalFilename ?? `Batch #${batch.id}`}
                  </Anchor>
                </Table.Td>
                <Table.Td>{batch.sourceSystem}</Table.Td>
                <Table.Td>{new Date(batch.uploadedAt).toLocaleString()}</Table.Td>
                <Table.Td>{batch.uploadedBy}</Table.Td>
                <Table.Td>
                  {batch.totalRows ?? "—"}
                  {batch.importedRowCount !== null ? ` (${batch.importedRowCount} imported)` : ""}
                </Table.Td>
                <Table.Td>
                  <Badge color={STATUS_COLORS[batch.status]}>{batch.status}</Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={opened} onClose={close} title="New Import">
        <Stack gap="md">
          <TextInput
            label="Source system"
            description='Whatever you call the system this export came from (e.g. "Northstar", "OneWorld") — reused to suggest a saved column mapping next time'
            required
            value={sourceSystem}
            onChange={(e) => setSourceSystem(e.currentTarget.value)}
          />
          <FileInput
            label="CSV or Excel file"
            placeholder="Choose file"
            accept={IMPORT_ACCEPTED_FILE_EXTENSIONS.join(",")}
            required
            value={file}
            onChange={setFile}
          />
          <Button onClick={handleUpload} loading={upload.isPending} disabled={!file || !sourceSystem.trim()}>
            Upload
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
