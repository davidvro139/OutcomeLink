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
import { useParams, useSearchParams } from "react-router-dom";
import {
  useComputeReportingPeriod,
  useReopenReportingPeriod,
  useReportingPeriod,
  useSubmitReportingPeriod,
  useValidateReportingPeriod,
} from "../../api/accreditation";
import { AuditHistory } from "../../components/AuditHistory";
import { CplDashboardTab } from "./CplDashboardTab";
<<<<<<< HEAD
=======
import { CloseoutTab } from "./CloseoutTab";
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
import { ImprovementPlansTab } from "./ImprovementPlansTab";
import { ReadinessTab } from "./ReadinessTab";
import { ReportsTab } from "./ReportsTab";
import { ValidationTab } from "./ValidationTab";
import { usePermissions } from "../../auth/usePermissions";
import { formatDateOnly } from "../../lib/dates";

const STATUS_COLORS: Record<string, string> = {
  OPEN: "blue",
  READY_FOR_REVIEW: "yellow",
  FINALIZED: "green",
  SUBMITTED: "grape",
  REOPENED: "orange",
};

<<<<<<< HEAD
const TAB_VALUES = ["dashboard", "readiness", "validation", "improvement-plans", "reports", "audit"];
=======
const TAB_VALUES = [
  "closeout",
  "dashboard",
  "readiness",
  "validation",
  "improvement-plans",
  "reports",
  "audit",
];
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a

export function ReportingPeriodDetailPage() {
  const { canAdminister } = usePermissions();
  const { id } = useParams<{ id: string }>();
  const periodId = Number(id);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
<<<<<<< HEAD
  const activeTab = requestedTab && TAB_VALUES.includes(requestedTab) ? requestedTab : "dashboard";
=======
  const activeTab = requestedTab && TAB_VALUES.includes(requestedTab) ? requestedTab : "closeout";
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
  const { data: period, isLoading } = useReportingPeriod(periodId);
  const compute = useComputeReportingPeriod(periodId);
  const validate = useValidateReportingPeriod(periodId);
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
            {formatDateOnly(period.startDate)} – {formatDateOnly(period.endDate)}
          </Text>
        </div>
        <Badge color={STATUS_COLORS[period.status]} size="lg">
          {period.status}
        </Badge>
      </Group>

      <Group>
        {canAdminister && (
          <Button onClick={handleCompute} loading={compute.isPending} disabled={isLocked}>
            Compute
          </Button>
        )}
        {canAdminister && (
          <Button variant="light" onClick={handleValidate} loading={validate.isPending}>
            Run Validation
          </Button>
        )}
        {!isLocked && canAdminister && (
          <Button
            variant="light"
            color="teal"
            onClick={() => setSearchParams({}, { replace: true })}
          >
            Close out…
          </Button>
        )}
        {period.status === "FINALIZED" && canAdminister && (
          <Button variant="light" color="grape" onClick={handleSubmit} loading={submit.isPending}>
            Mark Submitted
          </Button>
        )}
        {isLocked && canAdminister && (
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

      <Tabs
        value={activeTab}
        onChange={(value) =>
<<<<<<< HEAD
          setSearchParams(value && value !== "dashboard" ? { tab: value } : {}, { replace: true })
=======
          setSearchParams(value && value !== "closeout" ? { tab: value } : {}, { replace: true })
>>>>>>> 8c25610ddc365645f25f969dacf22a47f82f4c0a
        }
      >
        <Tabs.List>
          <Tabs.Tab value="closeout">Close-out</Tabs.Tab>
          <Tabs.Tab value="dashboard">CPL Dashboard</Tabs.Tab>
          <Tabs.Tab value="readiness">Readiness</Tabs.Tab>
          <Tabs.Tab value="validation">Data Validation</Tabs.Tab>
          <Tabs.Tab value="improvement-plans">Improvement Plans</Tabs.Tab>
          <Tabs.Tab value="reports">Reports</Tabs.Tab>
          <Tabs.Tab value="audit">Audit History</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="closeout" pt="md">
          <CloseoutTab
            reportingPeriodId={periodId}
            onOpenTab={(tab) => setSearchParams({ tab }, { replace: true })}
          />
        </Tabs.Panel>
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
