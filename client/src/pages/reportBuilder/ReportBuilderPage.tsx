import {
  ENROLLMENT_STATUSES,
  ENROLLMENT_STATUS_LABELS,
  EMPLOYMENT_STATUSES,
  REPORT_ENTITY_LABELS,
  REPORT_ENTITY_TYPES,
  REPORT_FIELDS_BY_ENTITY,
  REPORT_FILTERS_BY_ENTITY,
  type ReportDefinition,
  type ReportEntityType,
  type ReportFilterDef,
  type ReportFilterInput,
} from "@outcomelink/shared";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Paper,
  Select,
  Stack,
  Table,
  TagsInput,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useMemo, useState } from "react";
import { useReportingPeriods } from "../../api/accreditation";
import { useCampuses, usePrograms } from "../../api/programs";
import {
  useDeleteSavedReport,
  useRunCustomReport,
  useSavedReports,
  useSaveReport,
} from "../../api/reportBuilder";
import { downloadFile } from "../../lib/apiClient";

type FilterValueMap = Record<string, string[] | number[] | boolean | undefined>;

function definitionFiltersToMap(filters: ReportFilterInput[]): FilterValueMap {
  const map: FilterValueMap = {};
  for (const f of filters) map[f.field] = f.value;
  return map;
}

function FilterControl({
  def,
  value,
  onChange,
  programOptions,
  campusOptions,
}: {
  def: ReportFilterDef;
  value: string[] | number[] | boolean | undefined;
  onChange: (value: string[] | number[] | boolean | undefined) => void;
  programOptions: { value: string; label: string }[];
  campusOptions: { value: string; label: string }[];
}) {
  if (def.key === "programId") {
    return (
      <MultiSelect
        label={def.label}
        data={programOptions}
        value={((value as number[] | undefined) ?? []).map(String)}
        onChange={(v) => onChange(v.length > 0 ? v.map(Number) : undefined)}
        clearable
        searchable
      />
    );
  }
  if (def.key === "campusId") {
    return (
      <MultiSelect
        label={def.label}
        data={campusOptions}
        value={((value as number[] | undefined) ?? []).map(String)}
        onChange={(v) => onChange(v.length > 0 ? v.map(Number) : undefined)}
        clearable
        searchable
      />
    );
  }
  if (def.key === "enrollmentStatus") {
    return (
      <MultiSelect
        label={def.label}
        data={ENROLLMENT_STATUSES.map((s) => ({ value: s, label: ENROLLMENT_STATUS_LABELS[s] }))}
        value={(value as string[] | undefined) ?? []}
        onChange={(v) => onChange(v.length > 0 ? v : undefined)}
        clearable
      />
    );
  }
  if (def.key === "employmentStatus") {
    return (
      <MultiSelect
        label={def.label}
        data={[...EMPLOYMENT_STATUSES]}
        value={(value as string[] | undefined) ?? []}
        onChange={(v) => onChange(v.length > 0 ? v : undefined)}
        clearable
      />
    );
  }
  if (def.valueType === "boolean") {
    const boolValue = value as boolean | undefined;
    return (
      <Select
        label={def.label}
        data={[
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
        ]}
        value={boolValue === undefined ? null : String(boolValue)}
        onChange={(v) => onChange(v === null ? undefined : v === "true")}
        clearable
      />
    );
  }
  // Free-text multi-value filters (industry, state, credentialType) — no fixed
  // vocabulary exists for these anywhere else in the app either.
  return (
    <TagsInput
      label={def.label}
      value={(value as string[] | undefined) ?? []}
      onChange={(v) => onChange(v.length > 0 ? v : undefined)}
      clearable
    />
  );
}

/**
 * Custom Report Builder (Phase 3, spec §64). A curated, structured query
 * builder — pick an entity, pick columns, apply the filters that entity
 * supports, run it, export it, optionally save it for reuse. Not a generic
 * SQL/query interface: the field and filter registries in
 * shared/src/reportBuilder.ts are the entire vocabulary, matching exactly
 * what server/src/modules/reports/customReportBuilder.ts accepts.
 */
export function ReportBuilderPage() {
  const [entityType, setEntityType] = useState<ReportEntityType>("STUDENT");
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [filterValues, setFilterValues] = useState<FilterValueMap>({});
  const [reportingPeriodId, setReportingPeriodId] = useState<number | undefined>(undefined);
  const [saveModalOpened, { open: openSaveModal, close: closeSaveModal }] = useDisclosure(false);
  const [saveName, setSaveName] = useState("");
  const [exporting, setExporting] = useState(false);

  const { data: programs } = usePrograms();
  const { data: campuses } = useCampuses();
  const { data: reportingPeriods } = useReportingPeriods();
  const { data: savedReports } = useSavedReports();
  const runReport = useRunCustomReport();
  const saveReport = useSaveReport();
  const deleteSavedReport = useDeleteSavedReport();

  const fieldDefs = REPORT_FIELDS_BY_ENTITY[entityType];
  const filterDefs = REPORT_FILTERS_BY_ENTITY[entityType];
  const fieldGroups = useMemo(() => {
    const groups = new Map<string, typeof fieldDefs>();
    for (const f of fieldDefs) groups.set(f.group, [...(groups.get(f.group) ?? []), f]);
    return [...groups.entries()];
  }, [fieldDefs]);

  const programOptions = programs?.items.map((p) => ({ value: String(p.id), label: p.name })) ?? [];
  const campusOptions = campuses?.items.map((c) => ({ value: String(c.id), label: c.name })) ?? [];

  function handleEntityChange(next: string | null) {
    if (!next) return;
    setEntityType(next as ReportEntityType);
    setSelectedFields([]);
    setFilterValues({});
    // Fields and filters are entity-specific and reset above; the reporting
    // period isn't (periods are a real, shared concept across entities), but
    // leaving it set would let an already-selected period from a previous
    // entity silently satisfy the new entity's period-gating without the
    // user ever confirming it applies here too — reset it for a clean slate.
    setReportingPeriodId(undefined);
    runReport.reset();
  }

  function toggleField(key: string) {
    setSelectedFields((prev) => (prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]));
  }

  function buildDefinition(): ReportDefinition {
    const filters: ReportFilterInput[] = [];
    for (const def of filterDefs) {
      const value = filterValues[def.key];
      if (value === undefined) continue;
      if (Array.isArray(value) && value.length === 0) continue;
      filters.push({ field: def.key, value });
    }
    return { entityType, fields: selectedFields, filters, reportingPeriodId };
  }

  const missingPeriodForFields = selectedFields.some(
    (f) => fieldDefs.find((d) => d.key === f)?.requiresReportingPeriod,
  );
  const canRun = selectedFields.length > 0 && (!missingPeriodForFields || reportingPeriodId !== undefined);

  async function handleRun() {
    try {
      await runReport.mutateAsync(buildDefinition());
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to run report",
        color: "red",
      });
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      await downloadFile(
        "/api/reports/custom/export",
        `custom-report-${entityType.toLowerCase()}.xlsx`,
        { method: "POST", body: JSON.stringify(buildDefinition()) },
      );
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to export report",
        color: "red",
      });
    } finally {
      setExporting(false);
    }
  }

  async function handleSave() {
    try {
      await saveReport.mutateAsync({ name: saveName.trim(), definition: buildDefinition() });
      notifications.show({ message: "Report saved", color: "green" });
      setSaveName("");
      closeSaveModal();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to save report",
        color: "red",
      });
    }
  }

  function handleLoadSaved(savedId: string | null) {
    const saved = savedReports?.find((r) => String(r.id) === savedId);
    if (!saved) return;
    setEntityType(saved.definition.entityType);
    setSelectedFields(saved.definition.fields);
    setFilterValues(definitionFiltersToMap(saved.definition.filters));
    setReportingPeriodId(saved.definition.reportingPeriodId);
    runReport.reset();
  }

  async function handleDeleteSaved(id: number) {
    try {
      await deleteSavedReport.mutateAsync(id);
      notifications.show({ message: "Saved report deleted", color: "green" });
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to delete saved report",
        color: "red",
      });
    }
  }

  const result = runReport.data;

  return (
    <Stack p="xl" gap="lg">
      <Group justify="space-between">
        <Title order={2}>Report Builder</Title>
        {savedReports && savedReports.length > 0 && (
          <Select
            placeholder="Load a saved report…"
            data={savedReports.map((r) => ({ value: String(r.id), label: r.name }))}
            onChange={handleLoadSaved}
            clearable
            searchable
            w={260}
          />
        )}
      </Group>

      <Group align="flex-start" gap="xl" wrap="wrap">
        <Stack gap="md" style={{ flex: "0 0 260px" }}>
          <Select
            label="Report on"
            data={REPORT_ENTITY_TYPES.map((t) => ({ value: t, label: REPORT_ENTITY_LABELS[t] }))}
            value={entityType}
            onChange={handleEntityChange}
            allowDeselect={false}
          />
          <Select
            label="Reporting period"
            description={
              missingPeriodForFields
                ? "Required — some selected fields/filters depend on it"
                : "Optional — only needed for period-scoped fields"
            }
            data={reportingPeriods?.map((p) => ({ value: String(p.id), label: p.label })) ?? []}
            value={reportingPeriodId ? String(reportingPeriodId) : null}
            onChange={(v) => setReportingPeriodId(v ? Number(v) : undefined)}
            clearable
          />

          <Title order={5}>Filters</Title>
          {filterDefs.map((def) => (
            <FilterControl
              key={def.key}
              def={def}
              value={filterValues[def.key]}
              onChange={(v) => setFilterValues((prev) => ({ ...prev, [def.key]: v }))}
              programOptions={programOptions}
              campusOptions={campusOptions}
            />
          ))}
        </Stack>

        <Stack gap="md" style={{ flex: 1, minWidth: 280 }}>
          <Title order={5}>Columns</Title>
          {fieldGroups.map(([group, fields]) => (
            <Paper key={group} withBorder p="sm" radius="sm">
              <Text size="sm" fw={500} mb={4}>
                {group}
              </Text>
              <Group gap="md">
                {fields.map((field) => (
                  <Checkbox
                    key={field.key}
                    label={field.label}
                    checked={selectedFields.includes(field.key)}
                    onChange={() => toggleField(field.key)}
                  />
                ))}
              </Group>
            </Paper>
          ))}

          <Group>
            <Button onClick={handleRun} loading={runReport.isPending} disabled={!canRun}>
              Run Report
            </Button>
            <Button
              variant="light"
              onClick={handleExport}
              loading={exporting}
              disabled={!canRun}
            >
              Export to Excel
            </Button>
            <Button
              variant="light"
              color="grape"
              onClick={openSaveModal}
              disabled={selectedFields.length === 0}
            >
              Save Report
            </Button>
          </Group>
        </Stack>
      </Group>

      {savedReports && savedReports.length > 0 && (
        <Stack gap="xs">
          <Title order={5}>Saved reports</Title>
          <Group gap="xs">
            {savedReports.map((r) => (
              <Badge
                key={r.id}
                size="lg"
                variant="light"
                rightSection={
                  <Text
                    component="span"
                    size="xs"
                    style={{ cursor: "pointer" }}
                    onClick={() => handleDeleteSaved(r.id)}
                  >
                    ✕
                  </Text>
                }
              >
                {r.name}
              </Badge>
            ))}
          </Group>
        </Stack>
      )}

      {runReport.isPending && <Loader />}

      {result && (
        <Stack gap="sm">
          <Group justify="space-between">
            <Title order={5}>Results ({result.totalCount})</Title>
            {result.truncated && (
              <Alert color="yellow" py={4}>
                Showing the first {result.rows.length} of {result.totalCount} rows — export to
                Excel for the full set.
              </Alert>
            )}
          </Group>

          {result.rows.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              No rows matched.
            </Text>
          ) : (
            <Table.ScrollContainer minWidth={500}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    {selectedFields.map((f) => (
                      <Table.Th key={f}>{fieldDefs.find((d) => d.key === f)?.label ?? f}</Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {result.rows.map((row, i) => (
                    <Table.Tr key={i}>
                      {selectedFields.map((f) => (
                        <Table.Td key={f}>
                          {row[f] === null || row[f] === undefined ? "—" : String(row[f])}
                        </Table.Td>
                      ))}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Stack>
      )}

      <Modal opened={saveModalOpened} onClose={closeSaveModal} title="Save Report">
        <Stack gap="md">
          <TextInput
            label="Report name"
            required
            value={saveName}
            onChange={(e) => setSaveName(e.currentTarget.value)}
            description="Saving with the name of an existing report replaces it"
          />
          <Button onClick={handleSave} loading={saveReport.isPending} disabled={!saveName.trim()}>
            Save
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
