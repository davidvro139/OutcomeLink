import type { CplMetric } from "@outcomelink/shared";
import { Badge, Button, Group, Loader, Modal, Table, Text } from "@mantine/core";
import { useState } from "react";
import { useCplResults, useDrillDown } from "../../api/accreditation";

const METRICS: CplMetric[] = ["COMPLETION", "PLACEMENT", "LICENSURE"];
const BENCHMARKS: Record<CplMetric, number> = { COMPLETION: 60, PLACEMENT: 70, LICENSURE: 70 };

interface DrillDownState {
  metric: CplMetric;
  programId?: number;
  bucket: "numerator" | "denominator" | "excluded";
  label: string;
}

/**
 * Doubles as the program-comparison view (spec §28's MVP subset): rows are
 * programs plus an institution-wide summary row, columns are the three CPL
 * metrics. Every percentage is clickable straight into its drill-down —
 * spec §20's "no unexplained number" principle.
 */
export function CplDashboardTab({ reportingPeriodId }: { reportingPeriodId: number }) {
  const { data: results, isLoading } = useCplResults(reportingPeriodId);
  const [drillDown, setDrillDown] = useState<DrillDownState | null>(null);

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
    const belowBenchmark = percentage < BENCHMARKS[metric];
    return (
      <Button
        variant="subtle"
        color={belowBenchmark ? "red" : "green"}
        size="compact-sm"
        onClick={() =>
          setDrillDown({ metric, programId: programId ?? undefined, bucket: "denominator", label })
        }
      >
        {percentage}%{" "}
        {belowBenchmark && (
          <Badge color="red" size="xs" ml={4}>
            Below benchmark
          </Badge>
        )}
      </Button>
    );
  }

  return (
    <>
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
    </>
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
