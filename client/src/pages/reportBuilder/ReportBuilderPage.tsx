import {
  ENROLLMENT_STATUSES,
  ENROLLMENT_STATUS_LABELS,
  EMPLOYMENT_STATUSES,
  REPORT_BUILDER_MAX_PERIODS,
  REPORT_BUILDER_SYNC_EXPORT_THRESHOLD,
  REPORT_ENTITY_LABELS,
  REPORT_ENTITY_TYPES,
  REPORT_FIELDS_BY_ENTITY,
  REPORT_FILTERS_BY_ENTITY,
  REPORT_PERIOD_LABEL_FIELD_KEY,
  REPORT_PERIOD_LABEL_HEADER,
  type ReportDefinition,
  type ReportEntityType,
  type ReportFieldDef,
  type ReportFilterDef,
  type ReportFilterInput,
} from "@outcomelink/shared";
import { BarChart, LineChart } from "@mantine/charts";
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
import { Link } from "react-router-dom";
import { useReportingPeriods } from "../../api/accreditation";
import { useCampuses, usePrograms } from "../../api/programs";
import {
  type CustomReportResult,
  useDeleteSavedReport,
  useRunCustomReport,
  useSavedReports,
  useSaveReport,
} from "../../api/reportBuilder";
import { useQueueReportExport } from "../../api/reportExportJobs";
import { downloadFile } from "../../lib/apiClient";
import { ExportJobsPanel } from "./ExportJobsPanel";

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

const CHART_PERIOD_COLORS = [
  "blue.6",
  "teal.6",
  "grape.6",
  "orange.6",
  "red.6",
  "cyan.6",
  "lime.6",
  "pink.6",
  "yellow.6",
  "indigo.6",
];

/** Grouped-bar charts get unreadable well before this many distinct bars. */
const MAX_CHART_GROUPS = 20;

type ChartMode = "TREND" | "BY_LABEL" | "CATEGORY_COUNT";
type ChartStyle = "BAR" | "LINE";

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function aggregateNumeric(values: number[], kind: "numeric-sum" | "numeric-average"): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return kind === "numeric-sum" ? round1(sum) : round1(sum / values.length);
}

/** Distinct values of `key` across `rows`, in first-appearance order (not sorted). */
function distinctInOrder(rows: Record<string, unknown>[], key: string): string[] {
  const seen: string[] = [];
  for (const row of rows) {
    const v = String(row[key] ?? "—");
    if (!seen.includes(v)) seen.push(v);
  }
  return seen;
}

/**
 * Customizable chart comparison across the 2+ periods a report was run
 * with — only rendered when the result actually carries a period label.
 * Three modes, all computed client-side from the already-fetched rows (no
 * extra request): a metric's trend across periods, that same metric broken
 * out per period AND per some other selected column (e.g. per program), or
 * a category field's row-count broken out per period (a true frequency
 * histogram). Which modes are even offered depends on which of the
 * currently-selected columns are chart-capable (shared/src/reportBuilder.ts's
 * `chartKind`) — this is a viewer for whatever the user already chose to
 * see as columns, not a second, independent query. Rendered as either a
 * Mantine BarChart or LineChart (same `data`/`dataKey`/`series` shape for
 * both, so the "Chart style" toggle is a pure presentation switch — it
 * doesn't touch how chartData/series are computed above).
 */
function ReportChartPanel({
  result,
  fieldDefs,
  selectedFields,
}: {
  result: CustomReportResult;
  fieldDefs: ReportFieldDef[];
  selectedFields: string[];
}) {
  const [modeOverride, setModeOverride] = useState<ChartMode | null>(null);
  const [metricOverride, setMetricOverride] = useState<string | null>(null);
  const [labelOverride, setLabelOverride] = useState<string | null>(null);
  const [categoryOverride, setCategoryOverride] = useState<string | null>(null);
  const [chartStyle, setChartStyle] = useState<ChartStyle>("BAR");

  const numericFields = selectedFields
    .map((key) => fieldDefs.find((d) => d.key === key))
    .filter(
      (d): d is ReportFieldDef => !!d && (d.chartKind === "numeric-sum" || d.chartKind === "numeric-average"),
    );
  const categoricalFields = selectedFields
    .map((key) => fieldDefs.find((d) => d.key === key))
    .filter((d): d is ReportFieldDef => !!d && d.chartKind === "categorical");

  const availableModes: { value: ChartMode; label: string }[] = [];
  if (numericFields.length > 0) availableModes.push({ value: "TREND", label: "Trend across periods" });
  if (numericFields.length > 0 && selectedFields.length > 1) {
    availableModes.push({ value: "BY_LABEL", label: "Compare by column, per period" });
  }
  if (categoricalFields.length > 0) {
    availableModes.push({ value: "CATEGORY_COUNT", label: "Category counts per period" });
  }

  if (availableModes.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        Select at least one numeric or categorical column above to enable charting.
      </Text>
    );
  }

  const mode = availableModes.some((m) => m.value === modeOverride) ? modeOverride! : availableModes[0].value;
  const metricField = numericFields.some((f) => f.key === metricOverride) ? metricOverride! : numericFields[0]?.key;
  const labelOptions = selectedFields.filter((f) => f !== metricField);
  const labelField = labelOptions.includes(labelOverride ?? "") ? labelOverride! : labelOptions[0];
  const categoryField = categoricalFields.some((f) => f.key === categoryOverride)
    ? categoryOverride!
    : categoricalFields[0]?.key;

  const periodLabels = distinctInOrder(result.rows, REPORT_PERIOD_LABEL_FIELD_KEY);

  let chartData: Record<string, string | number>[] = [];
  let series: { name: string; color: string }[] = [];
  let dataKey = "";
  let truncatedGroups = false;

  if (mode === "TREND" && metricField) {
    const kind = fieldDefs.find((d) => d.key === metricField)!.chartKind as "numeric-sum" | "numeric-average";
    dataKey = "period";
    series = [{ name: "value", color: "blue.6" }];
    chartData = periodLabels.map((period) => {
      const values = result.rows
        .filter((r) => r[REPORT_PERIOD_LABEL_FIELD_KEY] === period)
        .map((r) => r[metricField])
        .filter((v): v is number => typeof v === "number");
      return { period, value: aggregateNumeric(values, kind) };
    });
  } else if (mode === "BY_LABEL" && metricField && labelField) {
    const kind = fieldDefs.find((d) => d.key === metricField)!.chartKind as "numeric-sum" | "numeric-average";
    dataKey = "label";
    series = periodLabels.map((p, i) => ({ name: p, color: CHART_PERIOD_COLORS[i % CHART_PERIOD_COLORS.length] }));
    const labelOrder = distinctInOrder(result.rows, labelField);
    truncatedGroups = labelOrder.length > MAX_CHART_GROUPS;
    chartData = labelOrder.slice(0, MAX_CHART_GROUPS).map((labelValue) => {
      const entry: Record<string, string | number> = { label: labelValue };
      for (const period of periodLabels) {
        const values = result.rows
          .filter(
            (r) => String(r[labelField] ?? "—") === labelValue && r[REPORT_PERIOD_LABEL_FIELD_KEY] === period,
          )
          .map((r) => r[metricField])
          .filter((v): v is number => typeof v === "number");
        if (values.length > 0) entry[period] = aggregateNumeric(values, kind);
      }
      return entry;
    });
  } else if (mode === "CATEGORY_COUNT" && categoryField) {
    dataKey = "category";
    series = periodLabels.map((p, i) => ({ name: p, color: CHART_PERIOD_COLORS[i % CHART_PERIOD_COLORS.length] }));
    const categoryOrder = distinctInOrder(result.rows, categoryField);
    truncatedGroups = categoryOrder.length > MAX_CHART_GROUPS;
    chartData = categoryOrder.slice(0, MAX_CHART_GROUPS).map((categoryValue) => {
      const entry: Record<string, string | number> = { category: categoryValue };
      for (const period of periodLabels) {
        entry[period] = result.rows.filter(
          (r) => String(r[categoryField] ?? "—") === categoryValue && r[REPORT_PERIOD_LABEL_FIELD_KEY] === period,
        ).length;
      }
      return entry;
    });
  }

  return (
    <Stack gap="sm">
      <Group gap="md" align="flex-end" wrap="wrap">
        <Select
          label="Chart type"
          data={availableModes.map((m) => ({ value: m.value, label: m.label }))}
          value={mode}
          onChange={(v) => v && setModeOverride(v as ChartMode)}
          allowDeselect={false}
          w={220}
        />
        {(mode === "TREND" || mode === "BY_LABEL") && (
          <Select
            label="Metric"
            data={numericFields.map((f) => ({ value: f.key, label: f.label }))}
            value={metricField ?? null}
            onChange={setMetricOverride}
            allowDeselect={false}
            w={200}
          />
        )}
        {mode === "BY_LABEL" && (
          <Select
            label="Group by"
            data={labelOptions.map((key) => ({
              value: key,
              label: fieldDefs.find((d) => d.key === key)?.label ?? key,
            }))}
            value={labelField ?? null}
            onChange={setLabelOverride}
            allowDeselect={false}
            w={200}
          />
        )}
        {mode === "CATEGORY_COUNT" && (
          <Select
            label="Category"
            data={categoricalFields.map((f) => ({ value: f.key, label: f.label }))}
            value={categoryField ?? null}
            onChange={setCategoryOverride}
            allowDeselect={false}
            w={200}
          />
        )}
        <Select
          label="Chart style"
          data={[
            { value: "BAR", label: "Bar" },
            { value: "LINE", label: "Line" },
          ]}
          value={chartStyle}
          onChange={(v) => v && setChartStyle(v as ChartStyle)}
          allowDeselect={false}
          w={140}
        />
      </Group>

      {truncatedGroups && (
        <Text size="xs" c="dimmed">
          Showing the first {MAX_CHART_GROUPS} groups — narrow your filters or columns to see the rest.
        </Text>
      )}

      {chartData.length === 0 ? (
        <Text c="dimmed" size="sm">
          No chartable data for this selection.
        </Text>
      ) : chartStyle === "BAR" ? (
        <BarChart h={280} data={chartData} dataKey={dataKey} series={series} withLegend={series.length > 1} />
      ) : (
        <LineChart h={280} data={chartData} dataKey={dataKey} series={series} withLegend={series.length > 1} />
      )}
    </Stack>
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
  const [reportingPeriodIds, setReportingPeriodIds] = useState<number[]>([]);
  const [saveModalOpened, { open: openSaveModal, close: closeSaveModal }] = useDisclosure(false);
  const [saveName, setSaveName] = useState("");
  const [exporting, setExporting] = useState(false);
  const queueExport = useQueueReportExport();

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
    // periods aren't (periods are a real, shared concept across entities), but
    // leaving them set would let periods already selected for a previous
    // entity silently satisfy the new entity's period-gating without the
    // user ever confirming it applies here too — reset for a clean slate.
    setReportingPeriodIds([]);
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
    return {
      entityType,
      fields: selectedFields,
      filters,
      reportingPeriodIds: reportingPeriodIds.length > 0 ? reportingPeriodIds : undefined,
    };
  }

  const missingPeriodForFields = selectedFields.some(
    (f) => fieldDefs.find((d) => d.key === f)?.requiresReportingPeriod,
  );
  const canRun = selectedFields.length > 0 && (!missingPeriodForFields || reportingPeriodIds.length > 0);

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
      // Report pagination and bounded exports (docs/TODO.md): a result over the
      // synchronous threshold queues a background job instead of a direct
      // download — one button, no two-kinds-of-export concept for the user.
      if (result && result.totalCount > REPORT_BUILDER_SYNC_EXPORT_THRESHOLD) {
        await queueExport.mutateAsync(buildDefinition());
        notifications.show({
          message: `This report has ${result.totalCount.toLocaleString()} rows, so it's being generated in the background — you'll get a notification when it's ready (see Export Jobs below).`,
          color: "blue",
          autoClose: 8000,
        });
        return;
      }
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
    setReportingPeriodIds(saved.definition.reportingPeriodIds ?? []);
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
  // Derived from the actual result rows (the request that produced them),
  // not the current reportingPeriodIds selection, since the user may have
  // changed the picker after running the report.
  const showsPeriodColumn = (result?.rows.length ?? 0) > 0 && REPORT_PERIOD_LABEL_FIELD_KEY in result!.rows[0];

  return (
    <Stack p="xl" gap="lg">
      <Group justify="space-between">
        <Title order={2}>Report Builder</Title>
        <Group gap="xs">
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
          <Button variant="light" component={Link} to="/report-builder/scheduled">
            Scheduled Reports
          </Button>
        </Group>
      </Group>

      <ExportJobsPanel />

      <Group align="flex-start" gap="xl" wrap="wrap">
        <Stack gap="md" style={{ flex: "0 0 260px" }}>
          <Select
            label="Report on"
            data={REPORT_ENTITY_TYPES.map((t) => ({ value: t, label: REPORT_ENTITY_LABELS[t] }))}
            value={entityType}
            onChange={handleEntityChange}
            allowDeselect={false}
          />
          <MultiSelect
            label="Reporting period(s)"
            description={
              missingPeriodForFields
                ? "Required — some selected fields/filters depend on it. Pick 2+ to compare across periods."
                : "Optional — only needed for period-scoped fields. Pick 2+ to compare across periods."
            }
            data={reportingPeriods?.map((p) => ({ value: String(p.id), label: p.label })) ?? []}
            value={reportingPeriodIds.map(String)}
            onChange={(v) => setReportingPeriodIds(v.map(Number))}
            maxValues={REPORT_BUILDER_MAX_PERIODS}
            clearable
            searchable
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
            <>
              {showsPeriodColumn && (
                <Paper withBorder p="md" radius="sm">
                  <Title order={5} mb="sm">
                    Chart
                  </Title>
                  {result.truncated && (
                    <Text size="xs" c="dimmed" mb="xs">
                      Based on the {result.rows.length} previewed rows only, not all {result.totalCount} —
                      export to Excel for a chart over the full set.
                    </Text>
                  )}
                  <ReportChartPanel result={result} fieldDefs={fieldDefs} selectedFields={selectedFields} />
                </Paper>
              )}
              <Table.ScrollContainer minWidth={500}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    {showsPeriodColumn && <Table.Th>{REPORT_PERIOD_LABEL_HEADER}</Table.Th>}
                    {selectedFields.map((f) => (
                      <Table.Th key={f}>{fieldDefs.find((d) => d.key === f)?.label ?? f}</Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {result.rows.map((row, i) => (
                    <Table.Tr key={i}>
                      {showsPeriodColumn && (
                        <Table.Td>{String(row[REPORT_PERIOD_LABEL_FIELD_KEY] ?? "—")}</Table.Td>
                      )}
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
            </>
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
