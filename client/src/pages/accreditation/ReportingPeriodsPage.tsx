import {
  Anchor,
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
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { Link } from "react-router-dom";
import {
  useCreateFramework,
  useCreateReportingPeriod,
  useCreateRuleSet,
  useFrameworks,
  useReportingPeriods,
  useRuleSets,
} from "../../api/accreditation";

const STATUS_COLORS: Record<string, string> = {
  OPEN: "blue",
  READY_FOR_REVIEW: "yellow",
  FINALIZED: "green",
  SUBMITTED: "grape",
  REOPENED: "orange",
};

export function ReportingPeriodsPage() {
  const { data: frameworks } = useFrameworks();
  const coeFramework = frameworks?.find((f) => f.name === "COE");
  const { data: ruleSets } = useRuleSets(coeFramework?.id);
  const { data: periods, isLoading } = useReportingPeriods();

  const createFramework = useCreateFramework();
  const createRuleSet = useCreateRuleSet();
  const createPeriod = useCreateReportingPeriod();
  const [periodModalOpened, { open: openPeriodModal, close: closePeriodModal }] =
    useDisclosure(false);
  const [ruleSetModalOpened, { open: openRuleSetModal, close: closeRuleSetModal }] =
    useDisclosure(false);

  const periodForm = useForm({
    initialValues: { ruleSetId: 0, label: "", startDate: "", endDate: "", outcomesDeadline: "" },
    validate: {
      ruleSetId: (v) => (v ? null : "Rule set is required"),
      label: (v) => (v.trim() ? null : "Label is required"),
      startDate: (v) => (v ? null : "Start date is required"),
      endDate: (v) => (v ? null : "End date is required"),
    },
  });

  const ruleSetForm = useForm({
    initialValues: {
      versionLabel: "COE-2026",
      effectiveStartDate: "",
      completion: 60,
      placement: 70,
      licensure: 70,
    },
  });

  async function ensureFramework(): Promise<number> {
    if (coeFramework) return coeFramework.id;
    const result = await createFramework.mutateAsync({
      name: "COE",
      description: "Council on Occupational Education",
    });
    return result.framework.id;
  }

  async function handleCreateRuleSet(values: typeof ruleSetForm.values) {
    try {
      const frameworkId = await ensureFramework();
      await createRuleSet.mutateAsync({
        frameworkId,
        versionLabel: values.versionLabel,
        effectiveStartDate: values.effectiveStartDate,
        ruleDefinition: {
          benchmarks: {
            completion: values.completion,
            placement: values.placement,
            licensure: values.licensure,
          },
        },
      });
      notifications.show({ message: "Rule set created", color: "green" });
      ruleSetForm.reset();
      closeRuleSetModal();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to create rule set",
        color: "red",
      });
    }
  }

  async function handleCreatePeriod(values: typeof periodForm.values) {
    try {
      await createPeriod.mutateAsync({
        ...values,
        outcomesDeadline: values.outcomesDeadline || undefined,
      });
      notifications.show({ message: "Reporting period created", color: "green" });
      periodForm.reset();
      closePeriodModal();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to create reporting period",
        color: "red",
      });
    }
  }

  return (
    <Stack p="xl" gap="md">
      <Group justify="space-between">
        <Title order={2}>Reporting Periods</Title>
        <Group>
          <Button variant="light" onClick={openRuleSetModal}>
            New COE Rule Set
          </Button>
          <Button onClick={openPeriodModal} disabled={!ruleSets?.length}>
            New Reporting Period
          </Button>
        </Group>
      </Group>

      {!ruleSets?.length && (
        <Text c="dimmed">
          Create a COE rule set (with benchmark percentages) before creating a reporting period.
        </Text>
      )}

      {isLoading && <Loader />}

      {periods && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Label</Table.Th>
              <Table.Th>Start</Table.Th>
              <Table.Th>End</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {periods.map((period) => (
              <Table.Tr key={period.id}>
                <Table.Td>
                  <Anchor component={Link} to={`/accreditation/reporting-periods/${period.id}`}>
                    {period.label}
                  </Anchor>
                </Table.Td>
                <Table.Td>{new Date(period.startDate).toLocaleDateString()}</Table.Td>
                <Table.Td>{new Date(period.endDate).toLocaleDateString()}</Table.Td>
                <Table.Td>
                  <Badge color={STATUS_COLORS[period.status] ?? "gray"}>{period.status}</Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={ruleSetModalOpened} onClose={closeRuleSetModal} title="New COE Rule Set">
        <form onSubmit={ruleSetForm.onSubmit(handleCreateRuleSet)}>
          <Stack gap="md">
            <TextInput
              label="Version label"
              required
              {...ruleSetForm.getInputProps("versionLabel")}
            />
            <input
              type="date"
              {...ruleSetForm.getInputProps("effectiveStartDate")}
              style={{ padding: 8 }}
            />
            <NumberInput
              label="Completion benchmark (%)"
              {...ruleSetForm.getInputProps("completion")}
            />
            <NumberInput
              label="Placement benchmark (%)"
              {...ruleSetForm.getInputProps("placement")}
            />
            <NumberInput
              label="Licensure benchmark (%)"
              {...ruleSetForm.getInputProps("licensure")}
            />
            <Button type="submit" loading={createRuleSet.isPending}>
              Create
            </Button>
          </Stack>
        </form>
      </Modal>

      <Modal opened={periodModalOpened} onClose={closePeriodModal} title="New Reporting Period">
        <form onSubmit={periodForm.onSubmit(handleCreatePeriod)}>
          <Stack gap="md">
            <Select
              label="Rule set"
              required
              data={ruleSets?.map((rs) => ({ value: String(rs.id), label: rs.versionLabel })) ?? []}
              onChange={(v) => periodForm.setFieldValue("ruleSetId", v ? Number(v) : 0)}
            />
            <TextInput
              label="Label"
              placeholder="2025-2026"
              required
              {...periodForm.getInputProps("label")}
            />
            <input type="date" {...periodForm.getInputProps("startDate")} style={{ padding: 8 }} />
            <input type="date" {...periodForm.getInputProps("endDate")} style={{ padding: 8 }} />
            <TextInput
              type="date"
              label="Outcomes deadline"
              description="Optional — when outcome data collection is due, distinct from the period's end date"
              {...periodForm.getInputProps("outcomesDeadline")}
            />
            <Button type="submit" loading={createPeriod.isPending}>
              Create
            </Button>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
