import {
  BUILT_IN_REPORT_TYPE_LABELS,
  BUILT_IN_REPORT_TYPES,
  BUILT_IN_REPORT_TYPES_REQUIRING_PERIOD,
  SCHEDULED_REPORT_FREQUENCIES,
  SCHEDULED_REPORT_FREQUENCY_LABELS,
  type BuiltInReportType,
  type ScheduledReportFrequency,
  type ScheduledReportSource,
} from "@outcomelink/shared";
import {
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useReportingPeriods } from "../../api/accreditation";
import { useSavedReports } from "../../api/reportBuilder";
import {
  downloadScheduledReportRun,
  type ScheduledReportSubscription,
  useCreateScheduledReportSubscription,
  useDeleteScheduledReportSubscription,
  useRunScheduledReportNow,
  useScheduledReportRuns,
  useScheduledReportSubscriptions,
  useUpdateScheduledReportSubscription,
} from "../../api/scheduledReports";
import { useAuth } from "../../auth/AuthContext";

// Matches server/src/lib/roles.ts's OPERATIONAL_ROLES (spec §4: Read-Only/Auditor cannot modify data).
const CAN_MANAGE_SUBSCRIPTIONS = [
  "SYSTEM_ADMINISTRATOR",
  "INSTITUTIONAL_ADMINISTRATOR",
  "PROGRAM_ADMINISTRATOR",
  "CAREER_SERVICES_STAFF",
  "INSTRUCTOR_STAFF",
];

interface FormState {
  name: string;
  frequency: ScheduledReportFrequency;
  reportSource: ScheduledReportSource;
  savedReportId: string | null;
  builtInReportType: BuiltInReportType | null;
  reportingPeriodId: string | null;
}

const EMPTY_FORM: FormState = {
  name: "",
  frequency: "MONTHLY",
  reportSource: "SAVED_REPORT",
  savedReportId: null,
  builtInReportType: null,
  reportingPeriodId: null,
};

function sourceLabel(subscription: ScheduledReportSubscription): string {
  if (subscription.reportSource === "SAVED_REPORT") return subscription.savedReport?.name ?? "(deleted saved report)";
  return BUILT_IN_REPORT_TYPE_LABELS[subscription.builtInReportType!];
}

function RunHistoryModal({ subscription, onClose }: { subscription: ScheduledReportSubscription; onClose: () => void }) {
  const { data: runs, isLoading } = useScheduledReportRuns(subscription.id);

  async function handleDownload(runId: number) {
    try {
      await downloadScheduledReportRun(runId);
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to download report",
        color: "red",
      });
    }
  }

  return (
    <Modal opened onClose={onClose} title={`Run history — ${subscription.name}`} size="lg">
      {isLoading && <Loader />}
      {runs && runs.length === 0 && (
        <Text c="dimmed" ta="center" py="md">
          No runs yet.
        </Text>
      )}
      {runs && runs.length > 0 && (
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Ran at</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Rows</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {runs.map((run) => (
              <Table.Tr key={run.id}>
                <Table.Td>{new Date(run.runAt).toLocaleString()}</Table.Td>
                <Table.Td>
                  <Badge color={run.status === "SUCCESS" ? "green" : "red"} size="sm">
                    {run.status}
                  </Badge>
                  {run.status === "FAILED" && run.errorMessage && (
                    <Text size="xs" c="dimmed" mt={2}>
                      {run.errorMessage}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>{run.rowCount ?? "—"}</Table.Td>
                <Table.Td>
                  {run.fileReference ? (
                    <Button size="xs" variant="light" onClick={() => handleDownload(run.id)}>
                      Download
                    </Button>
                  ) : (
                    <Text size="xs" c="dimmed">
                      No file
                    </Text>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Modal>
  );
}

/**
 * Recurring re-runs of a saved Custom Report Builder report or one of the 4
 * spec §50 built-in dashboards (Phase 3, docs/TODO.md's Scheduled Reports
 * entry). Delivery is in-app: a Notification plus a downloadable workbook —
 * there's no email infrastructure anywhere in this app to send it through.
 */
export function ScheduledReportsPage() {
  const { user } = useAuth();
  const canManage = !!user && CAN_MANAGE_SUBSCRIPTIONS.includes(user.role);

  const { data: subscriptions, isLoading } = useScheduledReportSubscriptions();
  const { data: savedReports } = useSavedReports();
  const { data: reportingPeriods } = useReportingPeriods();
  const createSubscription = useCreateScheduledReportSubscription();
  const updateSubscription = useUpdateScheduledReportSubscription();
  const deleteSubscription = useDeleteScheduledReportSubscription();
  const runNow = useRunScheduledReportNow();

  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [historySubscription, setHistorySubscription] = useState<ScheduledReportSubscription | null>(null);

  function openCreateModal() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    openModal();
  }

  function openEditModal(subscription: ScheduledReportSubscription) {
    setEditingId(subscription.id);
    setForm({
      name: subscription.name,
      frequency: subscription.frequency,
      reportSource: subscription.reportSource,
      savedReportId: subscription.savedReportId ? String(subscription.savedReportId) : null,
      builtInReportType: subscription.builtInReportType,
      reportingPeriodId: subscription.reportingPeriodId ? String(subscription.reportingPeriodId) : null,
    });
    openModal();
  }

  async function handleSave() {
    try {
      if (editingId) {
        await updateSubscription.mutateAsync({ id: editingId, input: { name: form.name, frequency: form.frequency } });
        notifications.show({ message: "Subscription updated", color: "green" });
      } else if (form.reportSource === "SAVED_REPORT") {
        if (!form.savedReportId) return;
        await createSubscription.mutateAsync({
          name: form.name,
          frequency: form.frequency,
          reportSource: "SAVED_REPORT",
          savedReportId: Number(form.savedReportId),
        });
        notifications.show({ message: "Subscription created", color: "green" });
      } else {
        if (!form.builtInReportType) return;
        await createSubscription.mutateAsync({
          name: form.name,
          frequency: form.frequency,
          reportSource: "BUILT_IN",
          builtInReportType: form.builtInReportType,
          reportingPeriodId: form.reportingPeriodId ? Number(form.reportingPeriodId) : undefined,
        });
        notifications.show({ message: "Subscription created", color: "green" });
      }
      closeModal();
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to save subscription",
        color: "red",
      });
    }
  }

  async function handleToggleActive(subscription: ScheduledReportSubscription) {
    try {
      await updateSubscription.mutateAsync({ id: subscription.id, input: { active: !subscription.active } });
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to update subscription",
        color: "red",
      });
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteSubscription.mutateAsync(id);
      notifications.show({ message: "Subscription deleted", color: "green" });
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to delete subscription",
        color: "red",
      });
    }
  }

  async function handleRunNow(id: number) {
    try {
      const result = await runNow.mutateAsync(id);
      notifications.show({
        message:
          result.run.status === "SUCCESS"
            ? `Ran successfully — ${result.run.rowCount ?? 0} rows`
            : `Run failed: ${result.run.errorMessage}`,
        color: result.run.status === "SUCCESS" ? "green" : "red",
      });
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : "Failed to run report",
        color: "red",
      });
    }
  }

  const builtInRequiresPeriod = form.builtInReportType && BUILT_IN_REPORT_TYPES_REQUIRING_PERIOD.includes(form.builtInReportType);
  const isSaveDisabled =
    !form.name.trim() ||
    (!editingId && form.reportSource === "SAVED_REPORT" && !form.savedReportId) ||
    (!editingId && form.reportSource === "BUILT_IN" && !form.builtInReportType);

  return (
    <Stack p="xl" gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={2}>Scheduled Reports</Title>
          <Text c="dimmed">
            Automatically re-run a report on a recurring schedule and deliver it as a notification with a
            downloadable workbook.{" "}
            <Anchor component={Link} to="/report-builder">
              Back to Report Builder
            </Anchor>
          </Text>
        </div>
        {canManage && <Button onClick={openCreateModal}>New Subscription</Button>}
      </Group>

      {isLoading && <Loader />}

      {subscriptions && subscriptions.length === 0 && (
        <Text c="dimmed" ta="center" py="xl">
          No scheduled reports yet. Click "New Subscription" to set one up.
        </Text>
      )}

      {subscriptions && subscriptions.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Report</Table.Th>
              <Table.Th>Frequency</Table.Th>
              <Table.Th>Active</Table.Th>
              <Table.Th>Next run</Table.Th>
              <Table.Th>Last run</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {subscriptions.map((s) => (
              <Table.Tr key={s.id}>
                <Table.Td>{s.name}</Table.Td>
                <Table.Td>{sourceLabel(s)}</Table.Td>
                <Table.Td>{SCHEDULED_REPORT_FREQUENCY_LABELS[s.frequency]}</Table.Td>
                <Table.Td>
                  <Switch
                    checked={s.active}
                    onChange={() => handleToggleActive(s)}
                    disabled={!canManage}
                    size="sm"
                  />
                </Table.Td>
                <Table.Td>{new Date(s.nextRunAt).toLocaleString()}</Table.Td>
                <Table.Td>
                  {s.runs[0] ? (
                    <Badge color={s.runs[0].status === "SUCCESS" ? "green" : "red"} size="sm">
                      {new Date(s.runs[0].runAt).toLocaleDateString()}
                    </Badge>
                  ) : (
                    <Text size="xs" c="dimmed">
                      Never
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button size="xs" variant="light" onClick={() => setHistorySubscription(s)}>
                      History
                    </Button>
                    {canManage && (
                      <>
                        <Button size="xs" variant="light" color="teal" onClick={() => handleRunNow(s.id)} loading={runNow.isPending}>
                          Run Now
                        </Button>
                        <Button size="xs" variant="subtle" onClick={() => openEditModal(s)}>
                          Edit
                        </Button>
                        <Button size="xs" variant="subtle" color="red" onClick={() => handleDelete(s.id)}>
                          Delete
                        </Button>
                      </>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={modalOpened} onClose={closeModal} title={editingId ? "Edit Subscription" : "New Subscription"} size="lg">
        <Stack gap="md">
          <TextInput
            label="Name"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.currentTarget.value })}
          />
          <Select
            label="Frequency"
            data={SCHEDULED_REPORT_FREQUENCIES.map((f) => ({ value: f, label: SCHEDULED_REPORT_FREQUENCY_LABELS[f] }))}
            value={form.frequency}
            onChange={(v) => setForm({ ...form, frequency: v as ScheduledReportFrequency })}
            allowDeselect={false}
          />

          {!editingId && (
            <Select
              label="Report source"
              data={[
                { value: "SAVED_REPORT", label: "A saved Custom Report Builder report" },
                { value: "BUILT_IN", label: "A built-in dashboard" },
              ]}
              value={form.reportSource}
              onChange={(v) =>
                setForm({ ...form, reportSource: v as ScheduledReportSource, savedReportId: null, builtInReportType: null, reportingPeriodId: null })
              }
              allowDeselect={false}
            />
          )}

          {!editingId && form.reportSource === "SAVED_REPORT" && (
            <Select
              label="Saved report"
              placeholder="Choose a saved report…"
              data={(savedReports ?? []).map((r) => ({ value: String(r.id), label: r.name }))}
              value={form.savedReportId}
              onChange={(v) => setForm({ ...form, savedReportId: v })}
              searchable
            />
          )}

          {!editingId && form.reportSource === "BUILT_IN" && (
            <>
              <Select
                label="Built-in report"
                placeholder="Choose a built-in report…"
                data={BUILT_IN_REPORT_TYPES.map((t) => ({ value: t, label: BUILT_IN_REPORT_TYPE_LABELS[t] }))}
                value={form.builtInReportType}
                onChange={(v) => setForm({ ...form, builtInReportType: v as BuiltInReportType, reportingPeriodId: null })}
              />
              {builtInRequiresPeriod && (
                <Select
                  label="Reporting period"
                  description="Leave blank to always use whatever's the institution's current reporting period at each run"
                  placeholder="Current period (recommended)"
                  data={(reportingPeriods ?? []).map((p) => ({ value: String(p.id), label: p.label }))}
                  value={form.reportingPeriodId}
                  onChange={(v) => setForm({ ...form, reportingPeriodId: v })}
                  clearable
                  searchable
                />
              )}
            </>
          )}

          <Button
            onClick={handleSave}
            loading={createSubscription.isPending || updateSubscription.isPending}
            disabled={isSaveDisabled}
          >
            Save
          </Button>
        </Stack>
      </Modal>

      {historySubscription && (
        <RunHistoryModal subscription={historySubscription} onClose={() => setHistorySubscription(null)} />
      )}
    </Stack>
  );
}
