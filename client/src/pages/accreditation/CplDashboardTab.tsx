import { usePermissions } from "../../auth/usePermissions";
import type { CplMetric } from "@outcomelink/shared";
import {
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  Tooltip,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import {
  type CreateImprovementPlanInput,
  useCplResults,
  useCreateImprovementPlan,
  useDrillDown,
  useReadiness,
  useReportingPeriod,
} from "../../api/accreditation";
import { downloadFile } from "../../lib/apiClient";
import { useUsers } from "../../api/users";

const METRICS: CplMetric[] = ["COMPLETION", "PLACEMENT", "LICENSURE"];
// Only a fallback for the institution-wide summary row, which has no single
// program to look up a negotiated rate for. Per-program cells use the
// Readiness endpoint's effective benchmark (getEffectiveBenchmark on the
// server), which accounts for negotiated rates — this used to be hardcoded
// here too, which meant a program with an approved negotiated rate it
// actually met could still show as "Below benchmark" here while the
// Readiness tab correctly showed it as ready. Two views of the same fact
// must never disagree.
<<<<<<< HEAD
const STANDARD_BENCHMARKS: Record<CplMetric, number> = { COMPLETION: 60, PLACEMENT: 70, LICENSURE: 70 };
=======
const STANDARD_BENCHMARKS: Record<CplMetric, number> = {
  COMPLETION: 60,
  PLACEMENT: 70,
  LICENSURE: 70,
};
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a

interface DrillDownState {
  metric: CplMetric;
  programId?: number;
  bucket: "numerator" | "denominator" | "excluded";
  label: string;
}

interface CreatePlanState {
  programId: number;
  programName: string;
  metric: CplMetric;
  currentResult: number;
}

/**
 * Doubles as the program-comparison view (spec §28's MVP subset): rows are
 * programs plus an institution-wide summary row, columns are the three CPL
 * metrics. Every percentage is clickable straight into its drill-down —
 * spec §20's "no unexplained number" principle.
 */
export function CplDashboardTab({ reportingPeriodId }: { reportingPeriodId: number }) {
  const { canWrite } = usePermissions();
  const { data: results, isLoading } = useCplResults(reportingPeriodId);
  const { data: readinessData } = useReadiness(reportingPeriodId);
  const { data: period } = useReportingPeriod(reportingPeriodId);
  const [drillDown, setDrillDown] = useState<DrillDownState | null>(null);
  const [createPlanState, setCreatePlanState] = useState<CreatePlanState | null>(null);
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      await downloadFile(
        `/api/accreditation/reporting-periods/${reportingPeriodId}/results/export`,
        `cpl-results-${period?.label ?? reportingPeriodId}.xlsx`,
      );
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to export CPL results",
        color: "red",
      });
    } finally {
      setExporting(false);
    }
  }

  if (isLoading) return <Loader />;
  if (!results || results.length === 0) {
    return (
      <Text c="dimmed" py="xl">
        No results yet — click "Compute" above to run the CPL calculation for this period.
      </Text>
    );
  }

  const programIds = [
    ...new Set(results.filter((r) => r.programId !== null).map((r) => r.programId!)),
  ];
  const programNames = new Map(
    results.filter((r) => r.program).map((r) => [r.programId, r.program!.name]),
  );

  function resultFor(programId: number | null, metric: CplMetric) {
    return results!.find((r) => r.programId === programId && r.metric === metric);
  }

  function effectiveBenchmarkFor(programId: number | null, metric: CplMetric) {
    if (programId !== null) {
      const row = readinessData?.readiness.find((r) => r.program.id === programId);
      const m = row?.metrics[metric];
      if (m) return { benchmark: m.benchmark, negotiated: m.negotiated };
    }
    return { benchmark: STANDARD_BENCHMARKS[metric], negotiated: false };
  }

  function renderCell(programId: number | null, metric: CplMetric, label: string) {
    const result = resultFor(programId, metric);
    if (!result || result.denominator === 0) {
      return (
        <Text size="sm" c="dimmed">
          N/A
        </Text>
      );
    }
    const percentage = Number(result.percentage);
    const { benchmark, negotiated } = effectiveBenchmarkFor(programId, metric);
    const belowBenchmark = percentage < benchmark;
    return (
      <Group gap={4} wrap="nowrap">
        <Button
          variant="subtle"
          color={belowBenchmark ? "red" : "green"}
          size="compact-sm"
          onClick={() =>
<<<<<<< HEAD
            setDrillDown({ metric, programId: programId ?? undefined, bucket: "denominator", label })
=======
            setDrillDown({
              metric,
              programId: programId ?? undefined,
              bucket: "denominator",
              label,
            })
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
          }
        >
          {percentage}%{" "}
          {belowBenchmark && (
            <Badge color="red" size="xs" ml={4}>
              Below benchmark
            </Badge>
          )}
          {negotiated && (
            <Badge color="grape" size="xs" ml={4} variant="outline">
              negotiated {benchmark}%
            </Badge>
          )}
        </Button>
<<<<<<< HEAD
        {belowBenchmark && programId !== null && (
=======
        {canWrite && belowBenchmark && programId !== null && (
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
          <Tooltip label="Create improvement plan">
            <Button
              variant="subtle"
              color="red"
              size="compact-xs"
              px={6}
              onClick={() =>
                setCreatePlanState({
                  programId,
                  programName: programNames.get(programId) ?? `Program ${programId}`,
                  metric,
                  currentResult: percentage,
                })
              }
            >
              +
            </Button>
          </Tooltip>
        )}
      </Group>
    );
  }

  return (
    <>
      <Group justify="flex-end" mb="sm">
        <Button size="xs" variant="light" onClick={handleExport} loading={exporting}>
          Export to Excel
        </Button>
      </Group>
      <Table striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Program</Table.Th>
            {METRICS.map((m) => (
              <Table.Th key={m}>{m}</Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {programIds.map((programId) => (
            <Table.Tr key={programId}>
              <Table.Td fw={500}>{programNames.get(programId) ?? `Program ${programId}`}</Table.Td>
              {METRICS.map((metric) => (
                <Table.Td key={metric}>
                  {renderCell(programId, metric, `${programNames.get(programId)} — ${metric}`)}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
          <Table.Tr bg="var(--mantine-color-default-hover)">
            <Table.Td fw={700}>Institution-wide</Table.Td>
            {METRICS.map((metric) => (
              <Table.Td key={metric}>
                {renderCell(null, metric, `Institution-wide — ${metric}`)}
              </Table.Td>
            ))}
          </Table.Tr>
        </Table.Tbody>
      </Table>

      <Modal
        opened={drillDown !== null}
        onClose={() => setDrillDown(null)}
        title={drillDown?.label}
        size="lg"
      >
        {drillDown && (
          <DrillDownContent
            reportingPeriodId={reportingPeriodId}
            state={drillDown}
            onChangeBucket={(bucket) => setDrillDown({ ...drillDown, bucket })}
          />
        )}
      </Modal>

      <Modal
        opened={createPlanState !== null}
        onClose={() => setCreatePlanState(null)}
<<<<<<< HEAD
        title={createPlanState ? `Improvement Plan — ${createPlanState.programName} (${createPlanState.metric})` : ""}
=======
        title={
          createPlanState
            ? `Improvement Plan — ${createPlanState.programName} (${createPlanState.metric})`
            : ""
        }
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
        size="lg"
      >
        {createPlanState && (
          <QuickCreatePlanForm
            reportingPeriodId={reportingPeriodId}
            state={createPlanState}
            onDone={() => setCreatePlanState(null)}
          />
        )}
      </Modal>
    </>
  );
}

function QuickCreatePlanForm({
  reportingPeriodId,
  state,
  onDone,
}: {
  reportingPeriodId: number;
  state: CreatePlanState;
  onDone: () => void;
}) {
  const { data: users } = useUsers();
  const createPlan = useCreateImprovementPlan();

  const form = useForm<{
    programId: number;
    metric: CreateImprovementPlanInput["metric"];
    reportingPeriodId: number;
    currentResult: number;
    target: number | "";
    responsibleUserId: number;
    problemDescription: string;
    rootCause: string;
    dueDate: string;
  }>({
    initialValues: {
      programId: state.programId,
      metric: state.metric,
      reportingPeriodId,
      currentResult: state.currentResult,
      target: "",
      responsibleUserId: 0,
      problemDescription: "",
      rootCause: "",
      dueDate: "",
    },
    validate: {
      responsibleUserId: (value) => (value ? null : "A responsible person is required"),
    },
  });

  async function handleSubmit(values: typeof form.values) {
    try {
      await createPlan.mutateAsync({
        ...values,
        target: values.target === "" ? undefined : values.target,
        dueDate: values.dueDate || undefined,
      });
      notifications.show({ message: "Improvement plan created", color: "green" });
      onDone();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to create improvement plan",
        color: "red",
      });
    }
  }

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack gap="sm">
        <NumberInput label="Target (%)" min={0} max={100} {...form.getInputProps("target")} />
        <Textarea
          label="Problem description"
          autosize
          minRows={2}
          {...form.getInputProps("problemDescription")}
        />
        <Textarea label="Root cause" autosize minRows={2} {...form.getInputProps("rootCause")} />
        <Select
          label="Responsible person"
          required
          data={users?.map((u) => ({ value: String(u.id), label: u.name })) ?? []}
          value={form.values.responsibleUserId ? String(form.values.responsibleUserId) : null}
          onChange={(v) => form.setFieldValue("responsibleUserId", v ? Number(v) : 0)}
        />
        <div>
          <Text size="sm" fw={500} mb={4}>
            Due date
          </Text>
<<<<<<< HEAD
          <input type="date" {...form.getInputProps("dueDate")} style={{ padding: 8, width: "100%" }} />
=======
          <input
            type="date"
            {...form.getInputProps("dueDate")}
            style={{ padding: 8, width: "100%" }}
          />
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
        </div>
        <Text size="xs" c="dimmed">
          See the "Improvement Plans" tab for the full plan, including status and progress updates.
        </Text>
        <Button type="submit" loading={createPlan.isPending}>
          Create Plan
        </Button>
      </Stack>
    </form>
  );
}

function DrillDownContent({
  reportingPeriodId,
  state,
  onChangeBucket,
}: {
  reportingPeriodId: number;
  state: DrillDownState;
  onChangeBucket: (bucket: DrillDownState["bucket"]) => void;
}) {
  const { data: students, isLoading } = useDrillDown(reportingPeriodId, state);

  return (
    <>
      <Group mb="md">
        <Button.Group>
          <Button
            variant={state.bucket === "numerator" ? "filled" : "default"}
            size="xs"
            onClick={() => onChangeBucket("numerator")}
          >
            Numerator
          </Button>
          <Button
            variant={state.bucket === "denominator" ? "filled" : "default"}
            size="xs"
            onClick={() => onChangeBucket("denominator")}
          >
            Denominator
          </Button>
          <Button
            variant={state.bucket === "excluded" ? "filled" : "default"}
            size="xs"
            onClick={() => onChangeBucket("excluded")}
          >
            Excluded
          </Button>
        </Button.Group>
      </Group>

      {isLoading && <Loader size="sm" />}

      {students && students.length === 0 && (
        <Text c="dimmed" size="sm">
          No students in this group.
        </Text>
      )}

      {students && students.length > 0 && (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Student</Table.Th>
              <Table.Th>Classification</Table.Th>
              <Table.Th>Why</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {students.map((s, i) => (
              <Table.Tr key={i}>
                <Table.Td>
                  {s.student.firstName} {s.student.lastName}
                </Table.Td>
                <Table.Td>
                  <Badge variant="light">{s.classificationCode}</Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{s.reasonText}</Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </>
  );
}
