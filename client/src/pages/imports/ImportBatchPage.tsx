import { IMPORT_REQUIRED_TARGET_FIELDS, IMPORT_TARGET_FIELDS, IMPORT_TARGET_FIELD_LABELS, type ImportColumnMapping, type ImportTargetField } from "@outcomelink/shared";
import { Alert, Badge, Button, Checkbox, Group, Loader, Pagination, Select, Stack, Table, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  useCommitImportBatch,
  useImportBatch,
  useImportPreview,
  useMappingProfiles,
  useSetImportMapping,
  useValidateImportBatch,
} from "../../api/imports";

const STATUS_COLORS: Record<string, string> = {
  UPLOADED: "gray",
  MAPPED: "blue",
  VALIDATED: "yellow",
  PREVIEWED: "grape",
  IMPORTED: "green",
  FAILED: "red",
};

function MappingStep({
  batchId,
  sourceColumns,
  sourceSystem,
  existingMapping,
}: {
  batchId: number;
  sourceColumns: string[];
  sourceSystem: string;
  existingMapping: ImportColumnMapping | null;
}) {
  const { data: profiles } = useMappingProfiles();
  const setMapping = useSetImportMapping(batchId);

  // Keyed by target field for the form UI; converted to the API's
  // source-column-keyed shape on submit.
  const initialByTarget: Partial<Record<ImportTargetField, string>> = {};
  if (existingMapping) {
    for (const [source, target] of Object.entries(existingMapping)) {
      if (target) initialByTarget[target] = source;
    }
  }
  const [byTarget, setByTarget] = useState(initialByTarget);
  const [saveAsProfile, setSaveAsProfile] = useState(false);

  const matchingProfile = profiles?.find((p) => p.sourceSystemName === sourceSystem);

  function applyProfile() {
    if (!matchingProfile) return;
    const next: Partial<Record<ImportTargetField, string>> = {};
    for (const [source, target] of Object.entries(matchingProfile.columnMapping)) {
      if (target) next[target] = source;
    }
    setByTarget(next);
  }

  async function handleSubmit() {
    const columnMapping: ImportColumnMapping = {};
    for (const [target, source] of Object.entries(byTarget)) {
      if (source) columnMapping[source] = target as ImportTargetField;
    }
    try {
      await setMapping.mutateAsync({
        columnMapping,
        mappingProfileId: matchingProfile?.id,
        saveAsProfile,
      });
      notifications.show({ message: "Mapping saved", color: "green" });
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to save mapping",
        color: "red",
      });
    }
  }

  const allRequiredMapped = IMPORT_REQUIRED_TARGET_FIELDS.every((f) => byTarget[f]);

  return (
    <Stack gap="md">
      <Title order={4}>Map Columns</Title>
      {matchingProfile && (
        <Alert color="blue">
          A saved mapping for "{sourceSystem}" exists.{" "}
          <Button size="xs" variant="light" onClick={applyProfile}>
            Apply saved mapping
          </Button>
        </Alert>
      )}
      <Table withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Target field</Table.Th>
            <Table.Th>Source column</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {IMPORT_TARGET_FIELDS.map((field) => (
            <Table.Tr key={field}>
              <Table.Td>
                {IMPORT_TARGET_FIELD_LABELS[field]}
                {IMPORT_REQUIRED_TARGET_FIELDS.includes(field) && (
                  <Text span c="red">
                    {" "}
                    *
                  </Text>
                )}
              </Table.Td>
              <Table.Td>
                <Select
                  placeholder="Not mapped"
                  data={sourceColumns}
                  value={byTarget[field] ?? null}
                  onChange={(v) => setByTarget((prev) => ({ ...prev, [field]: v ?? undefined }))}
                  clearable
                  w={260}
                />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Checkbox
        label={`Save this mapping for future "${sourceSystem}" imports`}
        checked={saveAsProfile}
        onChange={(e) => setSaveAsProfile(e.currentTarget.checked)}
      />
      <Button onClick={handleSubmit} loading={setMapping.isPending} disabled={!allRequiredMapped}>
        Save Mapping
      </Button>
    </Stack>
  );
}

function PreviewSection({ batchId }: { batchId: number }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useImportPreview(batchId, page);

  if (isLoading) return <Loader />;
  if (!data) return null;

  return (
    <Stack gap="sm">
      <Title order={5}>Preview ({data.totalValidRows} valid rows)</Title>
      <Table withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Row</Table.Th>
            <Table.Th>Internal ID</Table.Th>
            <Table.Th>First</Table.Th>
            <Table.Th>Last</Table.Th>
            <Table.Th>Email</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.items.map((row) => (
            <Table.Tr key={row.rowNumber}>
              <Table.Td>{row.rowNumber}</Table.Td>
              <Table.Td>{row.candidate.internalStudentId}</Table.Td>
              <Table.Td>{row.candidate.firstName}</Table.Td>
              <Table.Td>{row.candidate.lastName}</Table.Td>
              <Table.Td>{row.candidate.email ?? "—"}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {Math.ceil(data.totalValidRows / data.pageSize) > 1 && (
        <Pagination
          total={Math.ceil(data.totalValidRows / data.pageSize)}
          value={page}
          onChange={setPage}
        />
      )}
    </Stack>
  );
}

export function ImportBatchPage() {
  const { id } = useParams<{ id: string }>();
  const batchId = Number(id);
  const { data, isLoading } = useImportBatch(batchId);
  const validateBatch = useValidateImportBatch(batchId);
  const commitBatch = useCommitImportBatch(batchId);

  async function handleValidate() {
    try {
      const result = await validateBatch.mutateAsync();
      notifications.show({
        message: `${result.validRowCount} valid, ${result.errorRowCount} with errors`,
        color: result.errorRowCount > 0 ? "yellow" : "green",
      });
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to validate",
        color: "red",
      });
    }
  }

  async function handleCommit() {
    try {
      const result = await commitBatch.mutateAsync();
      notifications.show({ message: `Imported ${result.importedRowCount} students`, color: "green" });
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to commit import",
        color: "red",
      });
    }
  }

  if (isLoading) return <Loader m="xl" />;
  if (!data) return null;

  const { batch, rowErrors, sourceColumns } = data;

  return (
    <Stack p="xl" gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={2}>{batch.originalFilename ?? `Import #${batch.id}`}</Title>
          <Text c="dimmed">
            {batch.sourceSystem} · uploaded {new Date(batch.uploadedAt).toLocaleString()} by{" "}
            {batch.uploadedBy}
          </Text>
        </div>
        <Badge color={STATUS_COLORS[batch.status]} size="lg">
          {batch.status}
        </Badge>
      </Group>

      {(batch.status === "UPLOADED" || batch.status === "MAPPED") && (
        <MappingStep
          batchId={batch.id}
          sourceColumns={sourceColumns}
          sourceSystem={batch.sourceSystem}
          existingMapping={batch.columnMapping}
        />
      )}

      {batch.status === "MAPPED" && (
        <Button onClick={handleValidate} loading={validateBatch.isPending}>
          Run Validation
        </Button>
      )}

      {(batch.status === "VALIDATED" || batch.status === "PREVIEWED") && (
        <Stack gap="md">
          <Group>
            <Button variant="light" onClick={handleValidate} loading={validateBatch.isPending}>
              Re-run Validation
            </Button>
            <Button onClick={handleCommit} loading={commitBatch.isPending} color="teal">
              Commit Import
            </Button>
          </Group>

          {rowErrors.length > 0 && (
            <Stack gap="sm">
              <Title order={5} c="red">
                {rowErrors.length} Row Errors
              </Title>
              <Table withTableBorder striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Row</Table.Th>
                    <Table.Th>Error</Table.Th>
                    <Table.Th>Raw Data</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rowErrors.map((error) => (
                    <Table.Tr key={error.id}>
                      <Table.Td>{error.rowNumber}</Table.Td>
                      <Table.Td>{error.errorMessage}</Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed">
                          {Object.entries(error.rawRowData)
                            .map(([k, v]) => `${k}: ${v || "(empty)"}`)
                            .join(", ")}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Stack>
          )}

          <PreviewSection batchId={batch.id} />
        </Stack>
      )}

      {batch.status === "IMPORTED" && (
        <Alert color="green" title="Import complete">
          {batch.importedRowCount} student{batch.importedRowCount === 1 ? "" : "s"} imported.
        </Alert>
      )}
    </Stack>
  );
}
