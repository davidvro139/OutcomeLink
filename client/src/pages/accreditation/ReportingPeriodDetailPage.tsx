import {
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Tabs,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  useComputeReportingPeriod,
  useFinalizeReportingPeriod,
  useReopenReportingPeriod,
  useReportingPeriod,
  useSubmitReportingPeriod,
  useValidateReportingPeriod,
} from "../../api/accreditation";
import { AuditHistory } from "../../components/AuditHistory";
import { CplDashboardTab } from "./CplDashboardTab";
import { ImprovementPlansTab } from "./ImprovementPlansTab";
import { ReadinessTab } from "./ReadinessTab";
import { ReportsTab } from "./ReportsTab";
import { ValidationTab } from "./ValidationTab";

const STATUS_COLORS: Record<string, string> = {
  OPEN: "blue",
  READY_FOR_REVIEW: "yellow",
  FINALIZED: "green",
  SUBMITTED: "grape",
  REOPENED: "orange",
};

export function ReportingPeriodDetailPage() {
  const { id } = useParams<{ id: string }>();
  const periodId = Number(id);
  const { data: period, isLoading } = useReportingPeriod(periodId);
  const compute = useComputeReportingPeriod(periodId);
  const validate = useValidateReportingPeriod(periodId);
  const finalize = useFinalizeReportingPeriod(periodId);
  const submit = useSubmitReportingPeriod(periodId);
  const reopen = useReopenReportingPeriod(periodId);
  const [reopenOpened, { open: openReopen, close: closeReopen }] = useDisclosure(false);
  const [reopenReason, setReopenReason] = useState("");

  async function handleCompute() {
    try {
      await compute.mutateAsync(undefined);
      notifications.show({ message: "CPL calculation complete", color: "green" });
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Compute failed",
        color: "red",
      });
    }
  }

  async function handleValidate() {
    try {
      await validate.mutateAsync(undefined);
      notifications.show({ message: "Validation complete", color: "green" });
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Validation failed",
        color: "red",
      });
    }
  }

  async function handleFinalize() {
    try {
      await finalize.mutateAsync(undefined);
      notifications.show({ message: "Reporting period finalized", color: "green" });
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Finalize failed",
        color: "red",
      });
    }
  }

  async function handleSubmit() {
    try {
      await submit.mutateAsync(undefined);
      notifications.show({ message: "Reporting period marked submitted", color: "green" });
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Submit failed",
        color: "red",
      });
    }
  }

  async function handleReopen() {
    try {
      await reopen.mutateAsync({ reason: reopenReason });
      notifications.show({ message: "Reporting period reopened", color: "green" });
      setReopenReason("");
      closeReopen();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to reopen",
        color: "red",
      });
    }
  }

  if (isLoading) return <Loader m="xl" />;
  if (!period) return null;

  const isLocked = period.status === "FINALIZED" || period.status === "SUBMITTED";

  return (
    <Stack p="xl" gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={2}>{period.label}</Title>
          <Text c="dimmed">
            {new Date(period.startDate).toLocaleDateString()} –{" "}
            {new Date(period.endDate).toLocaleDateString()}
          </Text>
        </div>
        <Badge color={STATUS_COLORS[period.status]} size="lg">
          {period.status}
        </Badge>
      </Group>

      <Group>
        <Button onClick={handleCompute} loading={compute.isPending} disabled={isLocked}>
          Compute
        </Button>
        <Button variant="light" onClick={handleValidate} loading={validate.isPending}>
          Run Validation
        </Button>
        {!isLocked && (
          <Button
            variant="light"
            color="teal"
            onClick={handleFinalize}
            loading={finalize.isPending}
          >
            Finalize
          </Button>
        )}
        {period.status === "FINALIZED" && (
          <Button variant="light" color="grape" onClick={handleSubmit} loading={submit.isPending}>
            Mark Submitted
          </Button>
        )}
        {isLocked && (
          <Button variant="light" color="orange" onClick={openReopen}>
            Reopen
          </Button>
        )}
      </Group>

      {period.reopenReason && (
        <Text size="sm" c="dimmed">
          Last reopened by {period.reopenedBy} on{" "}
          {period.reopenedAt && new Date(period.reopenedAt).toLocaleString()}: "
          {period.reopenReason}"
        </Text>
      )}

      <Tabs defaultValue="dashboard">
        <Tabs.List>
          <Tabs.Tab value="dashboard">CPL Dashboard</Tabs.Tab>
          <Tabs.Tab value="readiness">Readiness</Tabs.Tab>
          <Tabs.Tab value="validation">Data Validation</Tabs.Tab>
          <Tabs.Tab value="improvement-plans">Improvement Plans</Tabs.Tab>
          <Tabs.Tab value="reports">Reports</Tabs.Tab>
          <Tabs.Tab value="audit">Audit History</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="dashboard" pt="md">
          <CplDashboardTab reportingPeriodId={periodId} />
        </Tabs.Panel>
        <Tabs.Panel value="readiness" pt="md">
          <ReadinessTab reportingPeriodId={periodId} />
        </Tabs.Panel>
        <Tabs.Panel value="validation" pt="md">
          <ValidationTab reportingPeriodId={periodId} />
        </Tabs.Panel>
        <Tabs.Panel value="improvement-plans" pt="md">
          <ImprovementPlansTab reportingPeriodId={periodId} />
        </Tabs.Panel>
        <Tabs.Panel value="reports" pt="md">
          <ReportsTab reportingPeriodId={periodId} />
        </Tabs.Panel>
        <Tabs.Panel value="audit" pt="md">
          <AuditHistory entityType="ReportingPeriod" entityId={periodId} />
        </Tabs.Panel>
      </Tabs>

      <Modal opened={reopenOpened} onClose={closeReopen} title="Reopen Reporting Period">
        <Stack gap="md">
          <Textarea
            label="Reason"
            required
            placeholder="Why does this period need to be reopened?"
            value={reopenReason}
            onChange={(e) => setReopenReason(e.currentTarget.value)}
          />
          <Button onClick={handleReopen} loading={reopen.isPending} disabled={!reopenReason.trim()}>
            Reopen
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
